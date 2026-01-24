import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as crypto from 'crypto';
import initSqlJs from 'sql.js';
import {
    logWithTime,
    getAppType,
    getDbMonitorKey,
    getClipboardTokenPattern,
    getAdditionalSessionTokens,
    getConfig,
    isPromptCacheTimerEnabled
} from './utils';
import { APP_NAME, PROMPT_CACHE_DURATION_MS, PROMPT_CACHE_UPDATE_INTERVAL_MS, DB_MONITOR_BACKUP_INTERVAL_MS, DB_WATCHER_DEBOUNCE_MS } from './constants';
import * as nativeFs from 'fs';

// ==================== 数据库监控 ====================
export class DbMonitor {
    private backupInterval: NodeJS.Timeout | null = null;
    private lastContentHash: string | null = null;
    private lastUpdateTimeMs: number = 0;  // 最后更新时间
    private wasmPath: string;
    private appType = getAppType();
    
    // 文件系统监控相关
    private walWatcher: nativeFs.FSWatcher | null = null;
    private dbWatcher: nativeFs.FSWatcher | null = null;
    private debounceTimer: NodeJS.Timeout | null = null;
    private currentDbPath: string | null = null;

    constructor(
        private context: vscode.ExtensionContext, 
        private triggerRefresh: () => void,
        private onDataChange?: (lastUpdateTimeMs: number) => void
    ) {
        this.wasmPath = vscode.Uri.joinPath(this.context.extensionUri, 'out', 'sql-wasm.wasm').fsPath;
    }

    private async getStateDbPathForCurrentWorkspace(): Promise<string | null> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return null;
        }
        const workspaceDir = workspaceFolders[0].uri.fsPath;
        try {
            if (!(await fs.pathExists(workspaceDir))) {
                return null;
            }
            const stats = await fs.stat(workspaceDir);
            const ctime = (stats as any).birthtimeMs || (stats as any).ctimeMs;
            const normalizedPath = os.platform() === 'win32' ? workspaceDir.replace(/^([A-Z]):/, (_match, letter) => (letter as string).toLowerCase() + ':') : workspaceDir;
            const hashInput = normalizedPath + Math.floor(ctime).toString();
            const workspaceId = crypto.createHash('md5').update(hashInput, 'utf8').digest('hex');
            let baseStoragePath: string;
            const platform = os.platform();
            const homeDir = os.homedir();

            // 根据应用类型确定存储路径
            const appFolderName = this.appType === 'trae' ? 'Trae' : (vscode.env.appName || 'Cursor');

            switch (platform) {
                case 'win32': {
                    const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
                    baseStoragePath = path.join(appData, appFolderName, 'User', 'workspaceStorage');
                    break;
                }
                case 'darwin':
                    baseStoragePath = path.join(homeDir, 'Library', 'Application Support', appFolderName, 'User', 'workspaceStorage');
                    break;
                default:
                    baseStoragePath = path.join(homeDir, '.config', appFolderName, 'User', 'workspaceStorage');
                    break;
            }
            const stateDbPath = path.join(baseStoragePath, workspaceId, 'state.vscdb');
            if (await fs.pathExists(stateDbPath)) {
                return stateDbPath;
            }
            return null;
        } catch {
            return null;
        }
    }

    private async queryMonitoredContent(stateDbPath: string): Promise<string | null> {
        try {
            const SQL = await initSqlJs({ locateFile: () => this.wasmPath });
            const fileBuffer = await fs.readFile(stateDbPath);
            const db = new SQL.Database(fileBuffer);
            const key = getDbMonitorKey();
            const res = db.exec(`SELECT value FROM ItemTable WHERE key = '${key}';`);
            db.close();
            if (res && res.length > 0 && res[0].values && res[0].values.length > 0) {
                const val = res[0].values[0][0];
                return typeof val === 'string' ? val : JSON.stringify(val);
            }
        } catch (e: any) {
            logWithTime(`[DbMonitor] Query failed: ${e?.message}`);
        }
        return null;
    }

    /**
     * 从 composerData 中解析最新对话的更新时间
     * @param content composer.composerData 的 JSON 字符串
     * @returns 最新对话的 lastUpdatedAt 时间戳（毫秒），如果解析失败返回 0
     */
    private parseLastUpdatedTimeFromContent(content: string): number {
        try {
            const data = JSON.parse(content);
            
            // Cursor: composer.composerData 格式
            if (data.allComposers && Array.isArray(data.allComposers)) {
                // 找到 lastUpdatedAt 最大的对话
                let maxLastUpdatedAt = 0;
                for (const composer of data.allComposers) {
                    if (composer.lastUpdatedAt && composer.lastUpdatedAt > maxLastUpdatedAt) {
                        maxLastUpdatedAt = composer.lastUpdatedAt;
                    }
                }
                if (maxLastUpdatedAt > 0) {
                    return maxLastUpdatedAt;
                }
            }
            
            // Trae: icube-ai-agent-storage-input-history 格式（如果有的话）
            // 可能需要根据实际格式调整
            if (Array.isArray(data)) {
                // 假设是时间戳排序的数组，取最后一个
                for (let i = data.length - 1; i >= 0; i--) {
                    if (data[i].timestamp) {
                        return data[i].timestamp;
                    }
                    if (data[i].lastUpdatedAt) {
                        return data[i].lastUpdatedAt;
                    }
                }
            }
        } catch (e: any) {
            // 解析失败，返回 0
            logWithTime(`[DbMonitor] 解析 lastUpdatedAt 失败: ${e?.message}`);
        }
        return 0;
    }

    /**
     * 处理文件变化事件（带防抖）
     */
    private handleFileChange(source: string): void {
        // 防抖：短时间内多次变化只触发一次
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        
        this.debounceTimer = setTimeout(async () => {
            this.debounceTimer = null;
            await this.tick();
        }, DB_WATCHER_DEBOUNCE_MS);
    }

    /**
     * 设置文件系统监控
     */
    private async setupFileWatchers(dbPath: string): Promise<void> {
        // 清理现有的 watchers
        this.cleanupWatchers();
        
        this.currentDbPath = dbPath;
        const walPath = dbPath + '-wal';

        // 监控 WAL 文件（SQLite 变化首先写入这里）
        try {
            if (await fs.pathExists(walPath)) {
                this.walWatcher = nativeFs.watch(walPath, (eventType) => {
                    if (eventType === 'change') {
                        this.handleFileChange('WAL');
                    }
                });
                this.walWatcher.on('error', (err) => {
                    logWithTime(`[DbMonitor] WAL watcher error: ${err.message}`);
                });
            }
        } catch (e: any) {
            logWithTime(`[DbMonitor] 无法监控 WAL 文件: ${e?.message}`);
        }

        // 监控主数据库文件（checkpoint 时会更新）
        try {
            this.dbWatcher = nativeFs.watch(dbPath, (eventType) => {
                if (eventType === 'change') {
                    this.handleFileChange('DB');
                }
            });
            this.dbWatcher.on('error', (err) => {
                logWithTime(`[DbMonitor] DB watcher error: ${err.message}`);
            });
        } catch (e: any) {
            logWithTime(`[DbMonitor] 无法监控主数据库文件: ${e?.message}`);
        }
    }

    /**
     * 清理文件监控器
     */
    private cleanupWatchers(): void {
        if (this.walWatcher) {
            this.walWatcher.close();
            this.walWatcher = null;
        }
        if (this.dbWatcher) {
            this.dbWatcher.close();
            this.dbWatcher = null;
        }
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
    }

    private async tick(): Promise<void> {
        try {
            const dbPath = await this.getStateDbPathForCurrentWorkspace();
            if (!dbPath) {
                return;
            }

            // 如果数据库路径变化，重新设置 watchers
            if (dbPath !== this.currentDbPath) {
                await this.setupFileWatchers(dbPath);
            }

            // Monitor both main DB and WAL file for changes
            const walPath = dbPath + '-wal';
            const mainDbExists = await fs.pathExists(dbPath);
            const walExists = await fs.pathExists(walPath);

            if (!mainDbExists) {
                return;
            }

            // 如果 WAL 文件新出现，需要重新设置 watcher
            if (walExists && !this.walWatcher) {
                await this.setupFileWatchers(dbPath);
            }

            // Create combined hash from both database content and WAL modification time
            let combinedContent = '';

            // Read main DB content
            const content = await this.queryMonitoredContent(dbPath);
            if (content) {
                combinedContent += content;
            }

            // 为了检测文件变化，仍然需要包含文件修改时间
            if (walExists) {
                const walStats = await fs.stat(walPath);
                combinedContent += `|wal:${walStats.mtimeMs}`;
            } else {
                const dbStats = await fs.stat(dbPath);
                combinedContent += `|db:${dbStats.mtimeMs}`;
            }

            const contentHash = crypto.createHash('md5').update(combinedContent, 'utf8').digest('hex');
            if (this.lastContentHash !== contentHash) {
                // 从对话数据中解析最后更新时间，而不是使用文件修改时间
                // 这样即使 reload 项目，也能获取到正确的对话更新时间
                let lastUpdatedAt = 0;
                if (content) {
                    lastUpdatedAt = this.parseLastUpdatedTimeFromContent(content);
                }
                
                // 如果解析失败，回退到当前时间
                const newLastUpdateTimeMs = lastUpdatedAt > 0 ? lastUpdatedAt : Date.now();
                
                this.lastContentHash = contentHash;
                
                // 只有当 lastUpdatedAt 真正变化时，才刷新使用量数据
                // 这样可以避免因为文件修改时间变化而触发不必要的 API 请求
                if (newLastUpdateTimeMs > this.lastUpdateTimeMs) {
                    logWithTime(`[DbMonitor] 对话更新时间变化: ${new Date(this.lastUpdateTimeMs).toLocaleTimeString()} -> ${new Date(newLastUpdateTimeMs).toLocaleTimeString()}, 触发使用量刷新`);
                    this.lastUpdateTimeMs = newLastUpdateTimeMs;
                    this.triggerRefresh();
                    
                    // 通知数据变化，传入最后更新时间（用于启动/更新计时器）
                    if (this.onDataChange) {
                        this.onDataChange(this.lastUpdateTimeMs);
                    }
                } else {
                    // 即使时间没变化，也更新 lastUpdateTimeMs 以保持一致性
                    // 但不触发刷新和计时器更新
                    this.lastUpdateTimeMs = newLastUpdateTimeMs;
                }
            }
        } catch (e: any) {
            logWithTime(`[DbMonitor] FAILED: ${e?.message ?? e}`);
        }
    }

    public async refresh(): Promise<void> {
        await this.tick();
    }

    public async start(): Promise<void> {
        const dbPath = await this.getStateDbPathForCurrentWorkspace();
        
        // 初始化：设置文件监控
        if (dbPath) {
            await this.setupFileWatchers(dbPath);
            await this.tick();
        }
        
        // 备份轮询：防止 watcher 失效的情况
        this.backupInterval = setInterval(() => this.tick(), DB_MONITOR_BACKUP_INTERVAL_MS);
        logWithTime(`[DbMonitor] 已启动（文件监控 + ${DB_MONITOR_BACKUP_INTERVAL_MS / 1000}秒备份轮询）`);
    }

    public stop(): void {
        this.cleanupWatchers();
        if (this.backupInterval) {
            clearInterval(this.backupInterval);
            this.backupInterval = null;
        }
        logWithTime('[DbMonitor] 已停止');
    }
}

// ==================== 剪贴板监控 ====================
export class ClipboardMonitor {
    private lastNotifiedToken: string | null = null;
    private appType = getAppType();

    async checkForToken(): Promise<void> {
        try {
            const tokenPattern = getClipboardTokenPattern();
            // 如果当前IDE不需要检测剪贴板token，直接返回
            if (!tokenPattern) {
                return;
            }
            const clipboardText = await vscode.env.clipboard.readText();
            const tokenMatch = clipboardText.match(tokenPattern);
            if (tokenMatch?.[1]) {
                await this.handleTokenDetected(tokenMatch[1]);
            }
        } catch (error) {
            //   logWithTime(`Clipboard check failed: ${error}`);
        }
    }

    private async handleTokenDetected(token: string): Promise<void> {
        const existingTokens = getAdditionalSessionTokens();
        if (existingTokens.includes(token)) {
            if (this.lastNotifiedToken !== token) {
                vscode.window.showInformationMessage(`Session token already in additional accounts.`);
                this.lastNotifiedToken = token;
            }
            return;
        }

        if (this.lastNotifiedToken !== token) {
            await this.promptAddToken(token);
        }
    }

    private async promptAddToken(token: string): Promise<void> {
        const message = this.appType === 'cursor'
            ? 'Found session token in clipboard. Add as additional account?'
            : 'Found session token in clipboard. Update Trae configuration?';

        const choice = await vscode.window.showInformationMessage(
            message,
            'Add',
            'Cancel'
        );

        if (choice === 'Add') {
            const existingTokens = getAdditionalSessionTokens();
            if (existingTokens.length >= 3) {
                vscode.window.showWarningMessage('Maximum 3 additional accounts allowed. Please remove one first.');
                return;
            }

            const newTokens = [...existingTokens, token];
            await getConfig().update('additionalSessionTokens', newTokens, vscode.ConfigurationTarget.Global);

            this.lastNotifiedToken = token;
            vscode.window.showInformationMessage('Session token added to additional accounts.');
            vscode.commands.executeCommand('cursorUsage.refresh');
        }
    }
}

// ==================== PromptCache 倒计时器 ====================
export class PromptCacheTimer {
    private statusBarItem: vscode.StatusBarItem;
    private updateInterval: NodeJS.Timeout | null = null;
    private endTime: number = 0;
    private isRunning: boolean = false;
    private configListener: vscode.Disposable;
    private commandDisposable: vscode.Disposable;
    private lastClickTime: number = 0;
    private static readonly DOUBLE_CLICK_THRESHOLD_MS = 500;

    constructor() {
        // 创建状态栏项，放在左边跟使用量放在一起（优先级略低于使用量的100，显示在使用量右边）
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 95);
        this.statusBarItem.command = 'cursorUsage.handleCacheTimerClick';
        // 默认使用绿色背景
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('testing.iconPassed');
        
        // 注册点击命令（支持双击检测）
        this.commandDisposable = vscode.commands.registerCommand('cursorUsage.handleCacheTimerClick', () => {
            this.handleClick();
        });
        
        // 监听配置变化
        this.configListener = vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('cursorUsage.showPromptCacheTimer')) {
                if (!isPromptCacheTimerEnabled()) {
                    this.stop();
                }
            }
        });
    }

    /**
     * 处理状态栏点击事件（支持双击检测）
     */
    private async handleClick(): Promise<void> {
        const now = Date.now();
        const timeSinceLastClick = now - this.lastClickTime;
        
        if (timeSinceLastClick < PromptCacheTimer.DOUBLE_CLICK_THRESHOLD_MS) {
            // 双击：关闭计时器功能
            this.lastClickTime = 0; // 重置，防止连续触发
            const config = getConfig();
            await config.update('showPromptCacheTimer', false, vscode.ConfigurationTarget.Global);
            this.stop();
            vscode.window.showInformationMessage('PromptCache Timer disabled. Enable it from the settings menu.');
        } else {
            // 单击：刷新用量数据
            this.lastClickTime = now;
            vscode.commands.executeCommand('cursorUsage.refresh');
        }
    }

    /**
     * 根据最后更新时间启动倒计时器
     * @param lastUpdateTimeMs 最后更新时间的时间戳（毫秒）
     */
    public startWithLastUpdateTime(lastUpdateTimeMs: number): void {
        // 如果配置禁用了计时器，不显示
        if (!isPromptCacheTimerEnabled()) {
            return;
        }

        const now = Date.now();
        const elapsedMs = now - lastUpdateTimeMs;
        const remainingMs = PROMPT_CACHE_DURATION_MS - elapsedMs;

        // 如果已经超过5分钟，不显示计时器
        if (remainingMs <= 0) {
            this.stop();
            logWithTime(`[PromptCacheTimer] 缓存已过期（${Math.round(elapsedMs / 1000)}秒前更新），不显示计时器`);
            return;
        }

        // 如果已经在运行，先停止
        if (this.isRunning) {
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
                this.updateInterval = null;
            }
        }

        this.isRunning = true;
        this.endTime = now + remainingMs;
        
        // 立即更新显示
        this.updateDisplay();
        
        // 启动定时器每秒更新
        this.updateInterval = setInterval(() => {
            this.updateDisplay();
        }, PROMPT_CACHE_UPDATE_INTERVAL_MS);

        this.statusBarItem.show();
        const remainingSec = Math.round(remainingMs / 1000);
        logWithTime(`[PromptCacheTimer] 倒计时开始，剩余 ${Math.floor(remainingSec / 60)}分${remainingSec % 60}秒`);
    }

    /**
     * 启动倒计时器（从当前时间开始5分钟）
     */
    public start(): void {
        this.startWithLastUpdateTime(Date.now());
    }

    /**
     * 重置倒计时器（重新开始5分钟）
     */
    public reset(): void {
        this.start();
        logWithTime('[PromptCacheTimer] 倒计时已重置');
    }

    /**
     * 停止倒计时器
     */
    public stop(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        this.isRunning = false;
        this.statusBarItem.hide();
        logWithTime('[PromptCacheTimer] 倒计时已停止');
    }

    /**
     * 更新状态栏显示
     */
    private updateDisplay(): void {
        const remainingMs = this.endTime - Date.now();

        if (remainingMs <= 0) {
            // 倒计时结束，隐藏状态栏
            this.stop();
            return;
        }

        const totalSeconds = Math.ceil(remainingMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        // 格式化显示 MM:SS
        const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        // 根据剩余时间设置不同颜色提示
        let icon = '$(clock)';
        if (totalSeconds <= 120) {
            // 最后2分钟，使用黄色警告
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            // 正常状态使用绿色背景
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('testing.iconPassed');
        }

        this.statusBarItem.text = `${icon} Cache ${timeStr}`;
        this.statusBarItem.tooltip = `PromptCache remaining: ${timeStr}\n\nClick to refresh usage data\nDouble-click to disable timer\n\nCache expires in ${minutes}m ${seconds}s`;
    }

    /**
     * 检查倒计时器是否正在运行
     */
    public isTimerRunning(): boolean {
        return this.isRunning;
    }

    /**
     * 获取剩余时间（毫秒）
     */
    public getRemainingTime(): number {
        if (!this.isRunning) {
            return 0;
        }
        return Math.max(0, this.endTime - Date.now());
    }

    /**
     * 释放资源
     */
    public dispose(): void {
        this.stop();
        this.configListener.dispose();
        this.commandDisposable.dispose();
        this.statusBarItem.dispose();
    }
}

















