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
    getConfig
} from './utils';
import { APP_NAME, PROMPT_CACHE_DURATION_MS, PROMPT_CACHE_UPDATE_INTERVAL_MS, DB_MONITOR_INTERVAL_MS } from './constants';

// ==================== 数据库监控 ====================
export class DbMonitor {
    private interval: NodeJS.Timeout | null = null;
    private lastContentHash: string | null = null;
    private wasmPath: string;
    private appType = getAppType();

    constructor(private context: vscode.ExtensionContext, private triggerRefresh: () => void) {
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

    private async tick(): Promise<void> {
        try {
            const dbPath = await this.getStateDbPathForCurrentWorkspace();
            if (!dbPath) {
                return;
            }

            // Monitor both main DB and WAL file for changes
            // SQLite uses Write-Ahead Logging (WAL) mode where changes are written to
            // state.vscdb-wal first, and only merged into state.vscdb during checkpoints.
            // By monitoring the WAL file's modification time, we can detect changes immediately.
            const walPath = dbPath + '-wal';
            const mainDbExists = await fs.pathExists(dbPath);
            const walExists = await fs.pathExists(walPath);

            if (!mainDbExists) {
                return;
            }

            // Create combined hash from both database content and WAL modification time
            let combinedContent = '';

            // Read main DB content
            const content = await this.queryMonitoredContent(dbPath);
            if (content) {
                combinedContent += content;
            }

            // If WAL exists, include its modification time in hash
            // This ensures we detect changes immediately when WAL is updated
            if (walExists) {
                const walStats = await fs.stat(walPath);
                combinedContent += `|wal:${walStats.mtimeMs}`;
            }

            const contentHash = crypto.createHash('md5').update(combinedContent, 'utf8').digest('hex');
            if (this.lastContentHash !== contentHash) {
                logWithTime(`[DbMonitor] 内容变化: ${this.lastContentHash?.slice(0, 8) ?? 'null'} -> ${contentHash.slice(0, 8)}, DB: ${dbPath}`);
                this.lastContentHash = contentHash;
                this.triggerRefresh();
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
        if (dbPath) await this.tick();
        this.interval = setInterval(() => this.tick(), DB_MONITOR_INTERVAL_MS);
    }

    public stop(): void {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
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

    constructor() {
        // 创建状态栏项，优先级设为较高以便显示在较右侧
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
        this.statusBarItem.command = 'cursorUsage.resetPromptCacheTimer';
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }

    /**
     * 启动倒计时器
     */
    public start(): void {
        // 如果已经在运行，先停止
        if (this.isRunning) {
            this.stop();
        }

        this.isRunning = true;
        this.endTime = Date.now() + PROMPT_CACHE_DURATION_MS;
        
        // 立即更新显示
        this.updateDisplay();
        
        // 启动定时器每秒更新
        this.updateInterval = setInterval(() => {
            this.updateDisplay();
        }, PROMPT_CACHE_UPDATE_INTERVAL_MS);

        this.statusBarItem.show();
        logWithTime('[PromptCacheTimer] 倒计时开始，5分钟后过期');
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
        if (totalSeconds <= 60) {
            // 最后1分钟，使用警告图标
            icon = '$(warning)';
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        } else if (totalSeconds <= 120) {
            // 最后2分钟，使用提示颜色
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            this.statusBarItem.backgroundColor = undefined;
        }

        this.statusBarItem.text = `${icon} Cache ${timeStr}`;
        this.statusBarItem.tooltip = `PromptCache 剩余时间: ${timeStr}\n\n点击重置倒计时\n缓存将在 ${minutes} 分 ${seconds} 秒后过期`;
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
        this.statusBarItem.dispose();
    }
}

















