import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AppType } from './types';

export { AppType };

// ==================== Trae Storage 自动读取 ====================
export interface TraeStorageAuthInfo {
    token: string;
    refreshToken: string;
    expiredAt: string;
    refreshExpiredAt: string;
    tokenReleaseAt: string;
    userId: string;
    aiRegion: string;
    region: string;
    host: string;
    account: {
        username: string;
        email: string;
    };
}

/**
 * 从 Trae 的 storage.json 文件中读取认证信息
 * 路径:
 *   - Windows: %APPDATA%\Trae\User\globalStorage\storage.json
 *   - macOS: ~/Library/Application Support/Trae/User/globalStorage/storage.json
 *   - Linux: ~/.config/Trae/User/globalStorage/storage.json
 */
export function getTraeStorageAuthInfo(): TraeStorageAuthInfo | null {
    try {
        // 获取 Trae storage.json 路径（支持跨平台）
        const platform = os.platform();
        const homeDir = os.homedir();
        let baseStoragePath: string;

        switch (platform) {
            case 'win32': {
                const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
                baseStoragePath = path.join(appData, 'Trae', 'User', 'globalStorage');
                break;
            }
            case 'darwin':
                baseStoragePath = path.join(homeDir, 'Library', 'Application Support', 'Trae', 'User', 'globalStorage');
                break;
            default:
                baseStoragePath = path.join(homeDir, '.config', 'Trae', 'User', 'globalStorage');
                break;
        }

        const storageJsonPath = path.join(baseStoragePath, 'storage.json');

        if (!fs.existsSync(storageJsonPath)) {
            logWithTime(`Trae storage.json 不存在: ${storageJsonPath}`);
            return null;
        }

        const storageContent = fs.readFileSync(storageJsonPath, 'utf-8');
        const storageData = JSON.parse(storageContent);

        // 查找 iCubeAuthInfo 键
        const authInfoKey = 'iCubeAuthInfo://icube.cloudide';
        const authInfoStr = storageData[authInfoKey];

        if (!authInfoStr) {
            logWithTime('Trae storage.json 中未找到 iCubeAuthInfo');
            return null;
        }

        const authInfo = JSON.parse(authInfoStr);

        // 检查 token 是否过期
        if (authInfo.expiredAt) {
            const expiredAt = new Date(authInfo.expiredAt);
            if (expiredAt < new Date()) {
                logWithTime('Trae storage token 已过期');
                return null;
            }
        }

        logWithTime(`成功从 Trae storage.json 读取认证信息, userId: ${authInfo.userId}, Path: ${storageJsonPath}`);
        return {
            token: authInfo.token,
            refreshToken: authInfo.refreshToken,
            expiredAt: authInfo.expiredAt,
            refreshExpiredAt: authInfo.refreshExpiredAt,
            tokenReleaseAt: authInfo.tokenReleaseAt,
            userId: authInfo.userId,
            aiRegion: authInfo.aiRegion,
            region: authInfo.region,
            host: authInfo.host,
            account: {
                username: authInfo.account?.username || '',
                email: authInfo.account?.email || ''
            }
        };
    } catch (error) {
        logWithTime(`读取 Trae storage.json 失败: ${error}`);
        return null;
    }
}

// 获取当前应用类型
export function getAppType(): AppType {
    const appName = (vscode.env.appName || '').toLowerCase();
    if (appName.includes('cursor')) return 'cursor';
    if (appName.includes('trae')) return 'trae';
    if (appName.includes('antigravity')) return 'antigravity';
    return 'unknown';
}

// 获取当前应用名称（用于显示）
export function getAppDisplayName(): string {
    const appType = getAppType();
    switch (appType) {
        case 'cursor': return 'Cursor';
        case 'trae': return 'Trae';
        default: return vscode.env.appName || 'Coding';
    }
}

// ==================== 配置管理 ====================
const CONFIG_PREFIX = 'cursorUsage';

export function getConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(CONFIG_PREFIX);
}

// 获取额外的 Session Tokens（最多 3 个副账号）
export function getAdditionalSessionTokens(): string[] {
    const tokens = getConfig().get<string[]>('additionalSessionTokens') || [];
    return tokens.slice(0, 3).filter(t => t && t.trim().length > 0);
}

// 获取团队服务器 URL
export function getTeamServerUrl(): string {
    return getConfig().get<string>('teamServerUrl') || '';
}

// 获取客户端 API Key
export function getClientApiKey(): string {
    return getConfig().get<string>('clientApiKey') || '';
}

// 设置客户端 API Key
export async function setClientApiKey(apiKey: string): Promise<void> {
    await getConfig().update('clientApiKey', apiKey, vscode.ConfigurationTarget.Global);
}

// 设置团队服务器 URL
export async function setTeamServerUrl(url: string): Promise<void> {
    await getConfig().update('teamServerUrl', url, vscode.ConfigurationTarget.Global);
}

// 检查是否启用投递
export function isReportingEnabled(): boolean {
    return getConfig().get<boolean>('enableReporting') || false;
}

// 检查是否显示所有提供者
export function isShowAllProvidersEnabled(): boolean {
    return getConfig().get<boolean>('showAllProviders') || false;
}

// 获取最近事件显示数量限制（0 表示禁用）
export function getRecentEventsLimit(): number {
    return getConfig().get<number>('recentEventsLimit') ?? 5;
}

// 检查是否启用 PromptCache 倒计时器
export function isPromptCacheTimerEnabled(): boolean {
    if (getAppType() !== 'cursor') {
        return false;
    }
    return getConfig().get<boolean>('showPromptCacheTimer') ?? true;
}

// ==================== 输出通道管理 ====================
let outputChannel: vscode.OutputChannel;

export function getOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('Coding Usage');
    }
    return outputChannel;
}

export function setOutputChannel(channel: vscode.OutputChannel): void {
    outputChannel = channel;
}

export function disposeOutputChannel(): void {
    if (outputChannel) {
        outputChannel.dispose();
    }
}

// ==================== 日志存储与简化 ====================
const MAX_LOG_ENTRIES = 1000;
const MAX_OUTPUT_LENGTH = 150; // Output channel 中单行最大显示字符数
const sessionLogs: string[] = [];

/**
 * 简化日志内容用于输出显示
 * 对于 API Response 等长内容进行截断
 */
function simplifyForOutput(message: string): string {
    // 检测是否是 API Response 格式
    const responseMatch = message.match(/^(\[API Response\] [A-Z]+ [^\s]+ => )(.+)$/);
    if (responseMatch) {
        const prefix = responseMatch[1];
        const jsonPart = responseMatch[2];
        if (jsonPart.length > MAX_OUTPUT_LENGTH) {
            return `${prefix}${jsonPart.substring(0, MAX_OUTPUT_LENGTH)}...`;
        }
    }

    // 对于其他过长的消息也进行截断
    if (message.length > MAX_OUTPUT_LENGTH + 50) {
        return message.substring(0, MAX_OUTPUT_LENGTH + 50) + '...';
    }

    return message;
}

/**
 * 添加日志到会话存储
 */
function addToSessionLogs(logMessage: string): void {
    sessionLogs.push(logMessage);
    // 超过最大条目数时移除最旧的日志
    if (sessionLogs.length > MAX_LOG_ENTRIES) {
        sessionLogs.shift();
    }
}

/**
 * 获取当前会话的所有日志
 */
export function getSessionLogs(): string[] {
    return [...sessionLogs];
}

/**
 * 清除会话日志
 */
export function clearSessionLogs(): void {
    sessionLogs.length = 0;
}

/**
 * 导出会话日志到文件
 */
export async function exportSessionLogs(): Promise<void> {
    if (sessionLogs.length === 0) {
        vscode.window.showInformationMessage('没有可导出的日志');
        return;
    }

    const defaultFileName = `coding-usage-logs-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.log`;

    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(defaultFileName),
        filters: {
            'Log Files': ['log', 'txt'],
            'All Files': ['*']
        },
        saveLabel: '导出日志'
    });

    if (uri) {
        const logContent = sessionLogs.join('\n');
        await vscode.workspace.fs.writeFile(uri, Buffer.from(logContent, 'utf-8'));
        vscode.window.showInformationMessage(`日志已导出到: ${uri.fsPath}`);
    }
}

// ==================== 日志工具 ====================
export function logWithTime(message: string): void {
    const timestamp = new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    const fullLogMessage = `[${timestamp}] ${message}`;

    // 保存完整日志用于导出
    addToSessionLogs(fullLogMessage);

    // 控制台输出完整日志
    console.log(fullLogMessage);

    // Output channel 输出简化后的日志
    const simplifiedMessage = simplifyForOutput(message);
    const simplifiedLogMessage = `[${timestamp}] ${simplifiedMessage}`;
    getOutputChannel().appendLine(simplifiedLogMessage);
}

// ==================== 格式化工具 ====================
// 格式化时间戳（Cursor 使用毫秒，Trae 使用秒）
export function formatTimestamp(timestamp: number, isSeconds: boolean = false): string {
    const ms = isSeconds ? timestamp * 1000 : timestamp;
    return new Date(ms).toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

// 格式化时间戳（不显示年份，格式：MM/DD HH:mm）
export function formatTimeWithoutYear(timestamp: number, isSeconds: boolean = false): string {
    const ms = isSeconds ? timestamp * 1000 : timestamp;
    const date = new Date(ms);
    const mm = (date.getMonth() + 1).toString().padStart(2, '0');
    const dd = date.getDate().toString().padStart(2, '0');
    const hh = date.getHours().toString().padStart(2, '0');
    const min = date.getMinutes().toString().padStart(2, '0');
    return `${mm}/${dd} ${hh}:${min}`;
}

export function formatTokensInMillions(tokens: number): string {
    return `${(tokens / 1000000).toFixed(2)}M`;
}

// ==================== 错误处理工具 ====================
export function isRetryableError(error: any): boolean {
    return error && (
        error.code === 'ECONNABORTED' ||
        error.message?.includes('timeout') ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNRESET' ||
        error.message?.includes('Failed to establish a socket connection to proxies') ||
        error.message?.includes('proxy')
    );
}

// ==================== 剪贴板匹配模式 ====================
// 获取剪贴板检测的正则表达式
// 只在匹配到对应IDE的token格式时才提示添加
// Cursor: WorkosCursorSessionToken=xxx
// Trae: X-Cloudide-Session=xxx
// Antigravity/Unknown: 不检测（返回null）
export function getClipboardTokenPattern(): RegExp | null {
    const appType = getAppType();
    if (appType === 'cursor') {
        return /WorkosCursorSessionToken=([^\n\s;]+)/;
    } else if (appType === 'trae') {
        return /X-Cloudide-Session=([^\s;]+)/;
    }
    // antigravity 和 unknown 不检测剪贴板token
    return null;
}

// ==================== Token 类型判断 ====================
// 判断 token 属于哪个 IDE 类型
// 用于副账号刷新时只更新对应 IDE 的账号
export type TokenIdeType = 'cursor' | 'trae' | 'unknown';

export function getTokenIdeType(token: string): TokenIdeType {
    if (!token) {
        return 'unknown';
    }

    // Cursor token 判断：
    // 1. 完整格式: WorkosCursorSessionToken=xxx
    // 2. 纯 token 格式: userId%3A%3AjwtToken (包含 %3A%3A 即 ::)
    // 3. JWT 格式: xxx.yyy.zzz (包含两个 .)
    if (token.includes('WorkosCursorSessionToken=')) {
        return 'cursor';
    }
    if (token.includes('%3A%3A')) {
        // Cursor token 格式: userId%3A%3AaccessToken
        return 'cursor';
    }
    // JWT 格式检测（两个 . 分隔的三段）
    const jwtPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
    if (jwtPattern.test(token) || (token.split('.').length === 3 && !token.includes('-'))) {
        return 'cursor';
    }

    // Trae token 判断：
    // 1. 完整格式: X-Cloudide-Session=xxx
    // 2. UUID 格式: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    if (token.includes('X-Cloudide-Session=')) {
        return 'trae';
    }
    // UUID 格式检测（8-4-4-4-12）
    const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
    if (uuidPattern.test(token)) {
        return 'trae';
    }

    return 'unknown';
}

// 根据 IDE 类型过滤副账号 token
export function filterTokensByIdeType(tokens: string[], ideType: 'cursor' | 'trae'): string[] {
    return tokens.filter(token => {
        const tokenType = getTokenIdeType(token);
        // 只返回匹配当前 IDE 类型的 token，或未知类型的 token（向后兼容）
        return tokenType === ideType || tokenType === 'unknown';
    });
}

// ==================== 数据库监控字段 ====================
export function getDbMonitorKey(): string {
    const appType = getAppType();
    if (appType === 'cursor') {
        return 'composer.composerData';
    } else if (appType === 'trae') {
        return 'icube-ai-agent-storage-input-history';
    }
    return 'composer.composerData';
}

// ==================== Dashboard URL ====================
export function getDashboardUrl(): string {
    const appType = getAppType();
    if (appType === 'cursor') {
        return 'https://cursor.com/dashboard?tab=usage';
    } else if (appType === 'trae') {
        return 'https://www.trae.ai/account-setting#usage';
    }
    return 'https://cursor.com/dashboard?tab=usage';
}













