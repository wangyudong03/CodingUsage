import * as vscode from 'vscode';
import * as os from 'os';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as crypto from 'crypto';
import initSqlJs from 'sql.js';

import { 
  disposeOutputChannel, 
  getOutputChannel, 
  logWithTime, 
  formatTimestamp, 
  getSessionToken,
  setSessionToken,
  isRetryableError,
  getAppType,
  getAppDisplayName,
  getConfig,
  getClientApiKey,
  getTeamServerUrl,
  getClipboardTokenPattern,
  getDbMonitorKey,
  getBrowserExtensionUrl,
  getDashboardUrl,
  BrowserType,
  isReportingEnabled
} from './utils';
import { 
  getApiService, 
  UsageSummaryResponse, 
  BillingCycleResponse,
  TraeApiResponse,
  TraeEntitlementPack
} from './apiService';
import { ServerDiscovery, TeamServerClient, PingManager } from './teamServerClient';

// ==================== 常量定义 ====================
const APP_NAME = getAppDisplayName();
const APP_TYPE = getAppType();
const DOUBLE_CLICK_DELAY = 300;
const MAX_RETRY_COUNT = 3;
const RETRY_DELAY = 1000;
const FETCH_TIMEOUT = 30000; // 30秒超时

// ==================== 浏览器检测 ====================
async function detectDefaultBrowser(): Promise<BrowserType> {
  const platform = os.platform();

  try {
    const command = getBrowserDetectionCommand(platform);
    if (!command) return 'unknown';

    return new Promise((resolve) => {
      cp.exec(command, (error, stdout) => {
        if (error) {
          logWithTime(`检测浏览器失败: ${error.message}`);
          resolve('unknown');
          return;
        }

        const browserType = parseBrowserOutput(stdout.toLowerCase());
        resolve(browserType);
      });
    });
  } catch (error) {
    logWithTime(`检测浏览器异常: ${error}`);
    return 'unknown';
  }
}

function getBrowserDetectionCommand(platform: string): string | null {
  switch (platform) {
    case 'win32':
      return 'reg query "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice" /v ProgId';
    case 'darwin':
      return 'defaults read com.apple.LaunchServices/com.apple.launchservices.secure LSHandlers | grep -A 2 -B 2 "LSHandlerURLScheme.*http"';
    case 'linux':
      return 'xdg-settings get default-web-browser';
    default:
      return null;
  }
}

function parseBrowserOutput(output: string): BrowserType {
  if (output.includes('chrome')) return 'chrome';
  if (output.includes('edge') || output.includes('msedge')) return 'edge';
  return 'unknown';
}

// ==================== Trae 使用量统计类型 ====================
interface TraeUsageStats {
  totalUsage: number;
  totalLimit: number;
  hasValidPacks: boolean;
}

// ==================== 主类 ====================
export class CodingUsageProvider {
  private billingCycleData: BillingCycleResponse | null = null;
  private summaryData: UsageSummaryResponse | null = null;
  private traeUsageData: TraeApiResponse | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private clickTimer: NodeJS.Timeout | null = null;
  private fetchTimeoutTimer: NodeJS.Timeout | null = null;
  private statusBarItem: vscode.StatusBarItem;
  private apiService = getApiService();
  private clickCount = 0;
  private isRefreshing = false;
  private isManualRefresh = false;
  private isAuthFailed = false;

  constructor(private context: vscode.ExtensionContext) {
    this.statusBarItem = this.createStatusBarItem();
    this.initialize();
  }

  public showOutput(): void {
    const outputChannel = getOutputChannel();
    outputChannel.show();
  }

  private createStatusBarItem(): vscode.StatusBarItem {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    item.command = 'cursorUsage.handleStatusBarClick';
    item.show();
    return item;
  }

  private initialize(): void {
    const sessionToken = getSessionToken();

    if (sessionToken) {
      this.isRefreshing = true;
      this.setLoadingState();
    } else {
      this.updateStatusBar();
    }

    this.fetchData();
  }

  // ==================== 点击处理 ====================
  handleStatusBarClick(): void {
    if (this.isRefreshing) {
      logWithTime('当前正在刷新中，忽略点击');
      return;
    }

    this.clickCount++;

    if (this.clickTimer) {
      this.clearClickTimer();
      vscode.commands.executeCommand('cursorUsage.updateSession');
    } else {
      this.clickTimer = setTimeout(() => {
        if (this.clickCount === 1) {
          this.refresh();
        }
        this.clearClickTimer();
      }, DOUBLE_CLICK_DELAY);
    }
  }

  private clearClickTimer(): void {
    if (this.clickTimer) {
      clearTimeout(this.clickTimer);
      this.clickTimer = null;
    }
    this.clickCount = 0;
  }

  // ==================== 状态检查和恢复 ====================
  public isInRefreshingState(): boolean {
    return this.isRefreshing;
  }

  public safeRefresh(): void {
    if (this.isRefreshing) {
      logWithTime('重置可能卡住的刷新状态');
      this.resetRefreshState();
    }
    this.fetchData();
  }

  // ==================== 刷新逻辑 ====================
  refresh(): void {
    logWithTime('手动刷新开始');
    this.isManualRefresh = true;
    this.isRefreshing = true;
    this.isAuthFailed = false;
    this.setLoadingState();
    
    // Trae 需要清除缓存
    if (APP_TYPE === 'trae') {
      this.apiService.clearTraeCache();
    }
    
    this.fetchData();
  }

  private setLoadingState(): void {
    this.statusBarItem.text = '$(loading~spin) Loading...';
    this.statusBarItem.tooltip = 'Refreshing usage data...';
    this.statusBarItem.color = undefined;
  }

  // ==================== 状态栏更新 ====================
  private updateStatusBar(): void {
    if (this.isRefreshing) {
      this.setLoadingState();
      return;
    }

    if (this.isAuthFailed) {
      this.showAuthFailedStatus();
      return;
    }

    const sessionToken = getSessionToken();
    if (!sessionToken) {
      this.showNotConfiguredStatus();
      return;
    }

    if (APP_TYPE === 'cursor') {
      this.updateCursorStatusBar();
    } else if (APP_TYPE === 'trae') {
      this.updateTraeStatusBar();
    } else {
      this.showNotConfiguredStatus();
    }
  }

  private updateCursorStatusBar(): void {
    if (!this.summaryData || !this.billingCycleData) {
      return;
    }
    this.showCursorUsageStatus();
  }

  private updateTraeStatusBar(): void {
    if (!this.traeUsageData || this.traeUsageData.code === 1001) {
      return;
    }

    const stats = this.calculateTraeUsageStats();
    if (stats.hasValidPacks) {
      this.showTraeUsageStatus(stats);
    } else {
      this.showNoActiveSubscriptionStatus();
    }
  }

  private showNotConfiguredStatus(): void {
    this.statusBarItem.text = `$(warning) ${APP_NAME}: Not Configured`;
    this.statusBarItem.color = undefined;
    this.statusBarItem.tooltip = 'Click to configure session token\n\nSingle click: Refresh\nDouble click: Configure';
  }

  private showAuthFailedStatus(): void {
    this.statusBarItem.text = `⚠️ ${APP_NAME}: Auth Failed`;
    this.statusBarItem.color = '#ff6b6b';
    this.statusBarItem.tooltip = 'Authentication failed: Session may be invalid or expired\nClick to reconfigure\n\nSingle click: Refresh\nDouble click: Configure';
  }

  private showNoActiveSubscriptionStatus(): void {
    this.statusBarItem.text = `$(info) ${APP_NAME}: No Active Subscription`;
    this.statusBarItem.color = undefined;
    this.statusBarItem.tooltip = 'No active subscription pack found\n\nSingle click: Refresh\nDouble click: Configure';
  }

  // ==================== Cursor 状态显示 ====================
  private showCursorUsageStatus(): void {
    if (!this.summaryData || !this.billingCycleData) return;

    const membershipType = this.summaryData.membershipType.toUpperCase();
    const plan = this.summaryData.individualUsage.plan;

    // 主要显示 API 使用进度
    const apiSpend = plan.apiSpend ?? 0;
    const apiLimit = plan.apiLimit ?? 0;
    
    if (apiLimit > 0) {
      // 有 API 限制时，显示 API 使用进度
      const apiSpendDollars = apiSpend / 100;
      const apiLimitDollars = apiLimit / 100;
      const percentage = (apiSpend / apiLimit) * 100;
      
      this.statusBarItem.text = `⚡ ${membershipType}: ${apiSpendDollars.toFixed(2)}/${apiLimitDollars.toFixed(0)} (${percentage.toFixed(1)}%)`;
    } else {
      // 回退到总体使用量显示
      const limitCents = plan.limit;
      const limitDollars = limitCents / 100;
      const limitWholeDollars = Math.round(limitDollars);
      const totalUsedCents = plan.breakdown?.total ?? plan.used;
      const totalUsedDollars = totalUsedCents / 100;
      const percentage = limitCents > 0 ? (totalUsedCents / limitCents) * 100 : 0;
      
      this.statusBarItem.text = `⚡ ${membershipType}: ${totalUsedDollars.toFixed(2)}/${limitWholeDollars} (${percentage.toFixed(1)}%)`;
    }
    
    this.statusBarItem.color = undefined;
    this.statusBarItem.tooltip = this.buildCursorDetailedTooltip();
  }

  // ==================== Trae 状态显示 ====================
  private showTraeUsageStatus(stats: TraeUsageStats): void {
    const { totalUsage, totalLimit } = stats;
    const remaining = totalLimit - totalUsage;
    const remainingFormatted = remaining.toFixed(1);

    this.statusBarItem.text = `⚡ Fast: ${totalUsage}/${totalLimit} (${remainingFormatted} Left)`;
    this.statusBarItem.color = undefined;
    this.statusBarItem.tooltip = this.buildTraeDetailedTooltip();
  }

  private calculateTraeUsageStats(): TraeUsageStats {
    let totalUsage = 0;
    let totalLimit = 0;
    let hasValidPacks = false;

    if (!this.traeUsageData) {
      return { totalUsage, totalLimit, hasValidPacks };
    }

    this.traeUsageData.user_entitlement_pack_list.forEach(pack => {
      const usage = pack.usage.premium_model_fast_amount;
      const limit = pack.entitlement_base_info.quota.premium_model_fast_request_limit;

      if (limit > 0) {
        totalUsage += usage;
        totalLimit += limit;
        hasValidPacks = true;
      }
    });

    return { totalUsage, totalLimit, hasValidPacks };
  }

  // ==================== Cursor Tooltip 构建 ====================
  private buildCursorDetailedTooltip(): string {
    return CodingUsageProvider.buildCursorTooltipFromData(this.summaryData, this.billingCycleData, new Date());
  }

  public static buildCursorTooltipFromData(
    summary: UsageSummaryResponse | null,
    billing: BillingCycleResponse | null,
    currentTime?: Date
  ): string {
    if (!summary || !billing) {
      return 'Click to configure session token\n\nSingle click: Refresh\nDouble click: Configure';
    }

    const membershipType = summary.membershipType.toUpperCase();
    const label = CodingUsageProvider.getCursorSubscriptionTypeLabel(membershipType);
    const plan = summary.individualUsage.plan;
    const expireTime = formatTimestamp(Number(billing.endDateEpochMillis));

    const sections: string[] = [];

    // API 使用进度（主要显示）
    const apiSpend = plan.apiSpend ?? 0;
    const apiLimit = plan.apiLimit ?? 0;
    if (apiLimit > 0) {
      const apiSpendDollars = apiSpend / 100;
      const apiLimitDollars = apiLimit / 100;
      const apiProgressInfo = CodingUsageProvider.buildProgressBar(apiSpend, apiLimit);
      
      sections.push(`API (${apiSpendDollars.toFixed(2)}/${apiLimitDollars.toFixed(0)})  Expire: ${expireTime}`);
      sections.push(`[${apiProgressInfo.progressBar}] ${apiProgressInfo.percentage}%`);
    }

    // Auto 使用进度（悬停时显示）
    const autoSpend = plan.autoSpend ?? 0;
    const autoLimit = plan.autoLimit ?? 0;
    if (autoLimit > 0) {
      const autoSpendDollars = autoSpend / 100;
      const autoLimitDollars = autoLimit / 100;
      const autoProgressInfo = CodingUsageProvider.buildProgressBar(autoSpend, autoLimit);
      
      sections.push('');
      sections.push(`Auto (${autoSpendDollars.toFixed(2)}/${autoLimitDollars.toFixed(0)})`);
      sections.push(`[${autoProgressInfo.progressBar}] ${autoProgressInfo.percentage}%`);
    }

    // 如果没有 API/Auto 数据，回退显示总体使用量
    if (apiLimit === 0 && autoLimit === 0) {
      const limitCents = plan.limit;
      const limitDollars = limitCents / 100;
      const limitWholeDollars = Math.round(limitDollars);
      const totalUsedCents = plan.breakdown?.total ?? plan.used;
      const totalUsedDollars = totalUsedCents / 100;
      const bonusCents = plan.breakdown?.bonus ?? 0;
      const bonusDollars = bonusCents / 100;
      const progressInfo = CodingUsageProvider.buildProgressBar(totalUsedDollars, limitDollars);

      let header: string;
      if (bonusCents > 0) {
        header = `${label}(${limitWholeDollars}+${bonusDollars.toFixed(2)}) Expire: ${expireTime}`;
      } else {
        header = `${label} (${totalUsedDollars.toFixed(2)}/${limitWholeDollars})  Expire: ${expireTime}`;
      }
      sections.push(header);
      sections.push(`[${progressInfo.progressBar}] ${progressInfo.percentage}%`);
    }

    const hintText = TeamServerClient.isTeamHintActive() ? "✅Connected" : undefined;
    sections.push('');
    sections.push(CodingUsageProvider.buildTimeSection(currentTime, hintText));

    return sections.join('\n');
  }

  public static getCursorSubscriptionTypeLabel(membershipType: string): string {
    switch (membershipType.toUpperCase()) {
      case 'PRO':
        return 'Pro Plan';
      case 'ULTRA':
        return 'Ultra Plan';
      default:
        return membershipType || 'Unknown';
    }
  }

  // ==================== Trae Tooltip 构建 ====================
  private buildTraeDetailedTooltip(): string {
    return CodingUsageProvider.buildTraeTooltipFromData(this.traeUsageData, new Date());
  }

  public static buildTraeTooltipFromData(usageData: TraeApiResponse | null, currentTime?: Date): string {
    if (!usageData || usageData.code === 1001) {
      return 'Click to configure Session ID\n\nSingle click: Refresh\nDouble click: Configure';
    }

    const sections: string[] = [];
    const validPacks = CodingUsageProvider.getTraeValidPacks(usageData.user_entitlement_pack_list);

    if (validPacks.length === 0) {
      sections.push('No valid subscription packs');
    } else {
      const packSections = CodingUsageProvider.buildTraePackSections(validPacks);
      sections.push(...packSections);
    }

    const hintText = TeamServerClient.isTeamHintActive() ? "✅Connected" : undefined;
    sections.push('');
    sections.push(CodingUsageProvider.buildTimeSection(currentTime, hintText));

    return sections.join('\n');
  }

  public static getTraeValidPacks(packList: TraeEntitlementPack[]): TraeEntitlementPack[] {
    return packList.filter(pack => CodingUsageProvider.hasTraeValidUsageData(pack));
  }

  public static hasTraeValidUsageData(pack: TraeEntitlementPack): boolean {
    const { quota } = pack.entitlement_base_info;
    return quota.premium_model_fast_request_limit > 0 ||
      quota.premium_model_slow_request_limit > 0 ||
      quota.auto_completion_limit > 0 ||
      quota.advanced_model_request_limit > 0;
  }

  public static buildTraePackSections(validPacks: TraeEntitlementPack[]): string[] {
    const sections: string[] = [];

    validPacks.forEach((pack, index) => {
      const { usage, entitlement_base_info } = pack;
      const { quota } = entitlement_base_info;

      const subscriptionType = CodingUsageProvider.getTraeSubscriptionTypeLabel(pack);
      const fastUsed = usage.premium_model_fast_amount;
      const fastLimit = quota.premium_model_fast_request_limit;

      if (fastLimit > 0) {
        const progressInfo = CodingUsageProvider.buildProgressBar(fastUsed, fastLimit);
        const header = `${subscriptionType} (${fastUsed}/${fastLimit})  Expire: ${formatTimestamp(entitlement_base_info.end_time, true)}`;
        sections.push(header);
        sections.push(`[${progressInfo.progressBar}] ${progressInfo.percentage}%`);

        if (index < validPacks.length - 1) {
          sections.push('');
        }
      }
    });

    return sections;
  }

  public static getTraeSubscriptionTypeLabel(pack: TraeEntitlementPack): string {
    const { entitlement_base_info } = pack;

    if (entitlement_base_info.product_type !== undefined) {
      const productType = entitlement_base_info.product_type;
      switch (productType) {
        case 1:
          return 'Pro Plan';
        case 2:
          return 'Extra Package';
        default:
          return 'Unknown';
      }
    }

    const { quota } = entitlement_base_info;
    if (quota.premium_model_fast_request_limit === -1) {
      return 'Unlimited';
    } else if (quota.premium_model_fast_request_limit > 1000) {
      return 'Premium';
    } else {
      return 'Basic';
    }
  }

  // ==================== 通用工具方法 ====================
  public static buildProgressBar(used: number, limit: number): { progressBar: string; percentage: number } {
    const percentage = limit > 0 ? Math.round((used / limit) * 100) : 0;
    const progressBarLength = 25;
    const filledLength = limit > 0 ? Math.round((used / limit) * progressBarLength) : 0;
    const clampedFilled = Math.max(0, Math.min(filledLength, progressBarLength));
    const progressBar = '█'.repeat(clampedFilled) + '░'.repeat(progressBarLength - clampedFilled);

    return { progressBar, percentage };
  }

  public static buildTimeSection(currentTime?: Date, leftText?: string): string {
    const now = currentTime || new Date();
    const mm = (now.getMonth() + 1).toString().padStart(2, '0');
    const dd = now.getDate().toString().padStart(2, '0');
    const hh = now.getHours().toString().padStart(2, '0');
    const min = now.getMinutes().toString().padStart(2, '0');
    const updateTime = `🕐 ${mm}/${dd} ${hh}:${min}`;
    const left = leftText ? `${leftText}` : '';
    const spaceCount = left.includes('Connected') ? 25 : 45;
    return `${left}${' '.repeat(spaceCount)}${updateTime}`;
  }

  async fetchData(retryCount = 0): Promise<void> {
    logWithTime(`fetchData 开始 (重试次数: ${retryCount}, 手动刷新: ${this.isManualRefresh})`);
    
    // 清除之前的超时定时器
    this.clearFetchTimeout();
    
    // 设置超时保护
    this.fetchTimeoutTimer = setTimeout(() => {
      logWithTime('fetchData 超时，强制重置状态');
      this.resetRefreshState();
      this.updateStatusBar();
      if (this.isManualRefresh) {
        vscode.window.showErrorMessage('Request timeout. Please try again.');
      }
    }, FETCH_TIMEOUT);
  
    try {
      const sessionToken = getSessionToken();
      if (!sessionToken) {
        logWithTime('没有配置 session token');
        this.handleNoSessionToken();
        return;
      }
  
      if (APP_TYPE === 'cursor') {
        await this.fetchCursorData(sessionToken);
      } else if (APP_TYPE === 'trae') {
        await this.fetchTraeData(sessionToken);
      } else {
        // 未知应用类型，尝试 Cursor
        await this.fetchCursorData(sessionToken);
      }
  
      this.clearFetchTimeout();
      this.resetRefreshState();  // 先重置状态
      this.updateStatusBar();    // 再更新状态栏
    } catch (error) {
      logWithTime(`fetchData 发生错误: ${error}`);
      this.clearFetchTimeout();
      this.handleFetchError(error, retryCount);
    }
  }
  

  private clearFetchTimeout(): void {
    if (this.fetchTimeoutTimer) {
      clearTimeout(this.fetchTimeoutTimer);
      this.fetchTimeoutTimer = null;
    }
  }

  private async fetchCursorData(sessionToken: string): Promise<void> {
    logWithTime('开始获取 Cursor 数据');
    try {
      const summary = await this.apiService.fetchCursorUsageSummary(sessionToken);
      logWithTime('成功获取 Cursor 使用量摘要');
      
      const startMillis = new Date(summary.billingCycleStart).getTime();
      const endMillis = new Date(summary.billingCycleEnd).getTime();
      this.billingCycleData = {
        startDateEpochMillis: String(startMillis),
        endDateEpochMillis: String(endMillis)
      };
      this.summaryData = summary;

      await TeamServerClient.submitCursorUsage(sessionToken, summary, this.billingCycleData);
    } catch (error) {
      logWithTime(`获取 Cursor 数据失败: ${error}`);
      throw error;
    }
  }

  private async fetchTraeData(sessionId: string): Promise<void> {
    logWithTime('开始获取 Trae 数据');
    try {
      const authToken = await this.apiService.getTraeTokenFromSession(sessionId, 0, this.isManualRefresh);
      if (!authToken) {
        logWithTime('获取 Trae 认证令牌失败');
        this.isAuthFailed = true;
        return;
      }

      logWithTime('成功获取 Trae 认证令牌');
      const responseData = await this.apiService.getTraeUserEntitlementList(authToken);
      if (responseData) {
        logWithTime('成功获取 Trae 使用量数据');
        this.traeUsageData = responseData;
        this.isAuthFailed = false;

        if (!this.apiService.isApiResponseSuccess(responseData)) {
          logWithTime(`Trae API 返回错误: code=${responseData?.code}`);
          this.apiService.handleTraeApiResponseError(responseData, '获取使用量数据');
          if (responseData?.code === 1001) {
            this.isAuthFailed = true;
            this.apiService.clearTraeCache();
          }
        } else {
          await this.submitTraeDataToTeamServer(responseData);
        }
      } else {
        logWithTime('Trae 返回数据为空');
      }
    } catch (error) {
      logWithTime(`获取 Trae 数据失败: ${error}`);
      throw error;
    }
  }

  private async submitTraeDataToTeamServer(data: TraeApiResponse): Promise<void> {
    if (!data || !data.user_entitlement_pack_list || data.user_entitlement_pack_list.length === 0) {
      return;
    }

    let totalUsage = 0;
    let totalLimit = 0;
    let expireTime = 0;
    let email = '';
    let membershipType = 'free';

    for (const pack of data.user_entitlement_pack_list) {
      const usage = pack.usage.premium_model_fast_amount;
      const limit = pack.entitlement_base_info.quota.premium_model_fast_request_limit;

      if (limit > 0) {
        totalUsage += usage;
        totalLimit += limit;

        if (pack.entitlement_base_info.end_time > expireTime) {
          expireTime = pack.entitlement_base_info.end_time;
        }

        if (!email && pack.entitlement_base_info.user_id) {
          email = pack.entitlement_base_info.user_id;
        }

        if (pack.entitlement_base_info.product_type === 1) {
          membershipType = 'pro';
        }
      }
    }

    if (totalLimit > 0) {
      await TeamServerClient.submitTraeUsage(email, {
        expire_time: expireTime,
        total_usage: totalLimit,
        used_usage: totalUsage,
        membership_type: membershipType
      });
    }
  }

  private resetRefreshState(): void {
    this.isManualRefresh = false;
    this.isRefreshing = false;
    this.clearFetchTimeout();
  }

  // ==================== 错误处理 ====================
  private handleNoSessionToken(): void {
    logWithTime('处理无 session token 情况');
    if (this.isManualRefresh) {
      this.showSetSessionMessage();
    }
    this.resetRefreshState();  // 先重置
    this.updateStatusBar();    // 再更新
  }
  

  private handleFetchError(error: any, retryCount: number): void {
    logWithTime(`获取数据失败 (尝试 ${retryCount + 1}/${MAX_RETRY_COUNT}): ${error}`);
  
    // 处理401认证失败情况
    if (error.response?.status === 401) {
      logWithTime('检测到 401 认证失败');
      this.isAuthFailed = true;
      this.resetRefreshState();  // 先重置
      this.updateStatusBar();    // 再更新
      
      if (this.isManualRefresh) {
        vscode.window.showErrorMessage(
          '认证失败：Session可能无效或已过期，请更新Session',
          '更新Session'
        ).then(selection => {
          if (selection === '更新Session') {
            vscode.commands.executeCommand('cursorUsage.updateSession');
          }
        });
      }
      return;
    }
  
    if (this.isManualRefresh) {
      const message = isRetryableError(error)
        ? 'Network is unstable. Please try again later.'
        : `Failed to get usage data: ${error?.toString() || 'Unknown error'}`;
  
      vscode.window.showErrorMessage(message);
      this.resetRefreshState();  // 先重置
      this.updateStatusBar();    // 再更新
      return;
    }
  
    if (retryCount < MAX_RETRY_COUNT) {
      this.scheduleRetry(retryCount);
    } else {
      logWithTime('API调用失败，已达到最大重试次数，停止重试');
      this.resetRefreshState();  // 先重置
      this.updateStatusBar();    // 再更新
    }
  }
  

  private scheduleRetry(retryCount: number): void {
    logWithTime(`API调用失败，将在1秒后进行第${retryCount + 1}次重试`);
    this.retryTimer = setTimeout(() => {
      this.fetchData(retryCount + 1);
    }, RETRY_DELAY);
  }

  // ==================== 消息显示 ====================
  private showSetSessionMessage(): void {
    vscode.window.showWarningMessage(
      'Please set your session token.',
      'Set Token'
    ).then(selection => {
      if (selection === 'Set Token') {
        vscode.commands.executeCommand('cursorUsage.updateSession');
      }
    });
  }

  // ==================== 清理 ====================
  dispose(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.clearClickTimer();
    this.clearFetchTimeout();
    if (this.statusBarItem) {
      this.statusBarItem.dispose();
    }
    disposeOutputChannel();
  }
}

// ==================== 数据库监控 ====================
class DbMonitor {
  private interval: NodeJS.Timeout | null = null;
  private lastContentHash: string | null = null;
  private wasmPath: string;

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
      const appFolderName = APP_TYPE === 'trae' ? 'Trae' : (vscode.env.appName || 'Cursor');
      
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
    return null;
  }

  private async tick(): Promise<void> {
    try {
      const dbPath = await this.getStateDbPathForCurrentWorkspace();
      if (!dbPath) {
        return;
      }
      const content = await this.queryMonitoredContent(dbPath);
      if (!content) {
        return;
      }
      const contentHash = crypto.createHash('md5').update(content, 'utf8').digest('hex');
      if (this.lastContentHash !== contentHash) {
        logWithTime(`[DbMonitor] 内容变化: ${this.lastContentHash?.slice(0, 8) ?? 'null'} -> ${contentHash.slice(0, 8)}`);
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
    logWithTime(`[DbMonitor] 监控数据库路径: ${dbPath}`);

    await this.tick();
    this.interval = setInterval(() => this.tick(), 10000);
  }

  public stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

// ==================== 剪贴板监控 ====================
class ClipboardMonitor {
  private lastNotifiedToken: string | null = null;
  private lastNotifiedConfig: string | null = null;

  async checkForToken(): Promise<void> {
    try {
      const clipboardText = await vscode.env.clipboard.readText();
      const tokenPattern = getClipboardTokenPattern();
      const tokenMatch = clipboardText.match(tokenPattern);
      if (tokenMatch?.[1]) {
        await this.handleTokenDetected(tokenMatch[1]);
      }
    } catch (error) {
      logWithTime(`Clipboard check failed: ${error}`);
    }
  }

  private async handleTokenDetected(token: string): Promise<void> {
    const currentToken = getSessionToken();

    if (token !== currentToken) {
      await this.promptUpdateToken(token);
      this.lastNotifiedToken = null;
    } else if (this.lastNotifiedToken !== token) {
      vscode.window.showInformationMessage(`Session token already configured.`);
      this.lastNotifiedToken = token;
    }
  }

  private async promptUpdateToken(token: string): Promise<void> {
    const choice = await vscode.window.showInformationMessage(
      `Found session token in clipboard. Update configuration?`,
      'Update',
      'Cancel'
    );

    if (choice === 'Update') {
      await setSessionToken(token);
      
      // Trae 需要重置主机
      if (APP_TYPE === 'trae') {
        await getApiService().resetTraeToDefaultHost();
      }
      
      vscode.window.showInformationMessage('Session token updated automatically.');
      vscode.commands.executeCommand('cursorUsage.refresh');
    }
  }

  private async openExtensionSettings(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:whyuds.coding-usage');
  }
}

// ==================== 扩展激活 ====================
export async function activate(context: vscode.ExtensionContext) {
  logWithTime(`${APP_NAME} Usage Monitor extension is now activated. AppType: ${APP_TYPE}`);
  
  const provider = new CodingUsageProvider(context);
  const clipboardMonitor = new ClipboardMonitor();
  const dbMonitor = new DbMonitor(context, () => provider.fetchData());
  const pingManager = new PingManager();

  // 启动数据库监控（每10秒检查变化）
  dbMonitor.start();

  // 服务器发现（API Key 会在首次投递时根据账号自动生成）
  await ServerDiscovery.autoConfigureIfNeeded();
  await TeamServerClient.checkAndUpdateConnectionStatus();
  pingManager.start();
  TeamServerClient.ping(true);

  registerCommands(context, provider);
  registerListeners(context, provider, clipboardMonitor);

  context.subscriptions.push({
    dispose: () => {
      dbMonitor.stop();
      pingManager.stop();
      provider.dispose();
    }
  });
}

function registerCommands(context: vscode.ExtensionContext, provider: CodingUsageProvider): void {
  const commands = [
    vscode.commands.registerCommand('cursorUsage.handleStatusBarClick', () => {
      provider.handleStatusBarClick();
    }),
    vscode.commands.registerCommand('cursorUsage.refresh', () => {
      provider.refresh();
    }),
    vscode.commands.registerCommand('cursorUsage.updateSession', async () => {
      await showUpdateSessionDialog();
    }),
    vscode.commands.registerCommand('cursorUsage.showOutput', () => {
      provider.showOutput();
    }),
    vscode.commands.registerCommand('cursorUsage.copyApiKey', async () => {
      const apiKey = getClientApiKey();
      const teamServerUrl = getTeamServerUrl();
      if (apiKey) {
        await vscode.env.clipboard.writeText(apiKey);
        if (teamServerUrl) {
          vscode.window.showInformationMessage('API Key copied! Opening platform...');
          vscode.commands.executeCommand('simpleBrowser.show', vscode.Uri.parse(teamServerUrl));
        } else {
          vscode.window.showInformationMessage('API Key copied to clipboard!');
        }
      } else {
        vscode.window.showErrorMessage('No API Key found. Please wait for it to be generated.');
      }
    })
  ];

  context.subscriptions.push(...commands);
}

function registerListeners(context: vscode.ExtensionContext, provider: CodingUsageProvider, clipboardMonitor: ClipboardMonitor): void {
  const windowStateListener = vscode.window.onDidChangeWindowState(async (e) => {
    if (e.focused) {
      setTimeout(async () => {
        clipboardMonitor.checkForToken();
        if (provider.isInRefreshingState()) {
          logWithTime('检测到之前可能卡住的刷新状态，尝试恢复...');
          provider.safeRefresh();
        }
      }, 500);
    }
  });

  context.subscriptions.push(windowStateListener);
}

async function showUpdateSessionDialog(): Promise<void> {
  const defaultBrowser = await detectDefaultBrowser();
  logWithTime(`更新Session时检测到默认浏览器: ${defaultBrowser}`);

  const extensionUrl = getBrowserExtensionUrl(defaultBrowser);
  const dashboardUrl = getDashboardUrl();
  const clientApiKey = getClientApiKey();
  const teamServerUrl = getTeamServerUrl();
  const reportingEnabled = isReportingEnabled();

  interface QuickPickItemExtended extends vscode.QuickPickItem {
    action: string;
  }

  // 构建团队上报开关的详情（使用低调的符号）
  const reportingStatus = reportingEnabled ? '● ON' : '○ OFF';
  const serverInfo = teamServerUrl ? teamServerUrl : 'Not configured';
  const apiKeyInfo = clientApiKey ? `${clientApiKey.substring(0, 11)}...` : 'Not generated';
  const reportingDetail = `Status: ${reportingStatus} | Server: ${serverInfo} | Key: ${apiKeyInfo}`;

  const items: QuickPickItemExtended[] = [
    {
      label: '$(cloud-download) Install Browser Extension',
      description: 'Install Chrome/Edge extension to easily copy your session token',
      detail: extensionUrl,
      action: 'installExtension'
    },
    {
      label: `$(globe) Visit ${APP_NAME} Dashboard`,
      description: `Open ${APP_NAME} dashboard to auto-copy session token`,
      detail: dashboardUrl,
      action: 'visitDashboard'
    },
    {
      label: reportingEnabled ? '$(check) Team Reporting: ON' : '$(circle-slash) Team Reporting: OFF',
      description: reportingEnabled ? 'Click to disable' : 'Click to enable',
      detail: reportingDetail,
      action: 'toggleReporting'
    },
    {
      label: '$(link-external) Copy API Key & Open Team Server',
      description: 'Copy your API Key and open team server in browser',
      detail: teamServerUrl ? `Server: ${teamServerUrl}` : 'Team server not configured',
      action: 'copyKeyAndOpenServer'
    },
    {
      label: '$(gear) Open Extension Settings',
      description: 'Open settings for this extension',
      detail: 'Configure session token, team server URL, and reporting options',
      action: 'openSettings'
    }
  ];

  const selectedItem = await vscode.window.showQuickPick(items, {
    title: `${APP_NAME} Usage Configuration`,
    placeHolder: 'Select an action',
    matchOnDescription: true,
    matchOnDetail: true
  });

  if (selectedItem) {
    switch (selectedItem.action) {
      case 'visitDashboard':
        vscode.env.openExternal(vscode.Uri.parse(dashboardUrl));
        break;
      case 'installExtension':
        vscode.env.openExternal(vscode.Uri.parse(extensionUrl));
        break;
      case 'toggleReporting':
        // 切换上报开关
        const newReportingState = !reportingEnabled;
        const configObj = getConfig();
        await configObj.update('enableReporting', newReportingState, vscode.ConfigurationTarget.Global);
          const statusText = newReportingState ? 'enabled' : 'disabled';
        vscode.window.showInformationMessage(`Team reporting ${statusText}!`);
        break;
      case 'copyKeyAndOpenServer':
        // 复制 API Key 并跳转到 team server
        if (!clientApiKey) {
          vscode.window.showWarningMessage('API Key not generated yet. Please configure Session Token and refresh to generate API Key.');
          break;
        }
        await vscode.env.clipboard.writeText(clientApiKey);
        
        if (teamServerUrl) {
          vscode.env.openExternal(vscode.Uri.parse(teamServerUrl));
          vscode.window.showInformationMessage(`API Key copied! Opening team server...`);
        } else {
          vscode.window.showInformationMessage(`API Key copied! Please configure team server URL in settings.`);
        }
        break;
      case 'openSettings':
        await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:whyuds.coding-usage');
        break;
    }
  }
}

export async function deactivate() {
  logWithTime(`${APP_NAME} Usage Monitor extension is now deactivated.`);
  await TeamServerClient.ping(false);
}
