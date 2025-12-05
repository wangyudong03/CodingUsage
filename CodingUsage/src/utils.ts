import * as vscode from 'vscode';

// ==================== 应用类型定义 ====================
export type AppType = 'cursor' | 'trae' | 'unknown';

// 获取当前应用类型
export function getAppType(): AppType {
  const appName = (vscode.env.appName || '').toLowerCase();
  if (appName.includes('cursor')) return 'cursor';
  if (appName.includes('trae')) return 'trae';
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

// 获取 Session Token（统一配置项）
export function getSessionToken(): string | undefined {
  return getConfig().get<string>('sessionToken');
}

// 设置 Session Token（统一配置项）
export async function setSessionToken(token: string): Promise<void> {
  await getConfig().update('sessionToken', token, vscode.ConfigurationTarget.Global);
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

// 获取上次的账号ID（用于检测账号变化）
export function getLastAccountId(): string {
  return getConfig().get<string>('lastAccountId') || '';
}

// 设置上次的账号ID
export async function setLastAccountId(accountId: string): Promise<void> {
  await getConfig().update('lastAccountId', accountId, vscode.ConfigurationTarget.Global);
}

// 设置团队服务器 URL
export async function setTeamServerUrl(url: string): Promise<void> {
  await getConfig().update('teamServerUrl', url, vscode.ConfigurationTarget.Global);
}

// 检查是否启用投递
export function isReportingEnabled(): boolean {
  return getConfig().get<boolean>('enableReporting') || false;
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
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  getOutputChannel().appendLine(logMessage);
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
    hour12: false
  });
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
export function getClipboardTokenPattern(): RegExp {
  const appType = getAppType();
  if (appType === 'cursor') {
    return /WorkosCursorSessionToken=([^\n\s;]+)/;
  } else if (appType === 'trae') {
    return /X-Cloudide-Session=([^\s;]+)/;
  }
  // 支持两种格式
  return /(?:WorkosCursorSessionToken|X-Cloudide-Session)=([^\n\s;]+)/;
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

// ==================== 浏览器扩展 URL ====================
export type BrowserType = 'chrome' | 'edge' | 'unknown';

export function getBrowserExtensionUrl(browserType: BrowserType): string {
  // 统一使用 Cursor 的浏览器扩展
  if (browserType === 'edge') {
    return 'https://microsoftedge.microsoft.com/addons/detail/trae-usage-token-extracto/leopdblngeedggognlgokdlfpiojalji';
  }
  return 'https://chromewebstore.google.com/detail/trae-usage-token-extracto/edkpaodbjadikhahggapfilgmfijjhei';
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
