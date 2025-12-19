import * as vscode from 'vscode';
import * as os from 'os';
import * as crypto from 'crypto';
import axios from 'axios';
import {
  logWithTime,
  getAppDisplayName,
  getTeamServerUrl,
  getClientApiKey,
  setClientApiKey,
  setTeamServerUrl,
  isReportingEnabled,
  getLastAccountId,
  setLastAccountId
} from './utils';
import { UsageSummaryResponse, BillingCycleResponse, AggregatedUsageResponse, getApiService } from './apiService';

const API_TIMEOUT = 5000;
const SERVER_LIST_URL = 'https://gist.githubusercontent.com/lasoons/60b1dac84abee807ffe3d1aa0ac60967/raw/coding_usage_config.json';

// 从远程获取服务器列表（只在 team server 未配置时调用一次）
async function fetchServerList(): Promise<string[]> {
  try {
    logWithTime('从远程获取服务器列表...');
    // 加时间戳绕过 GitHub CDN 缓存
    const url = `${SERVER_LIST_URL}?t=${Date.now()}`;
    const response = await axios.get(url, { timeout: 5000 });
    const servers = response.data?.servers || [];
    logWithTime(`获取到 ${servers.length} 个服务器配置`);
    return servers;
  } catch (e) {
    logWithTime(`获取远程服务器列表失败: ${e}`);
    return [];
  }
}

// ==================== ApiKey 生成器 ====================
const API_KEY_SALT = '123456';

export class ApiKeyGenerator {
  // 生成 apikey（基于 appName + 账号ID + 固定盐），带 ck_ 前缀
  static generateApiKey(accountId: string): string {
    const appName = vscode.env.appName || 'Unknown';
    const baseString = `${appName}-${accountId}-${API_KEY_SALT}`;
    const hash = crypto.createHash('md5').update(baseString).digest('hex');
    return `ck_${hash}`;
  }

  // 检查账号变化并更新 API Key
  static async checkAndUpdateApiKey(accountId: string): Promise<string> {
    if (!accountId) {
      logWithTime('账号ID为空，跳过 API Key 更新');
      return getClientApiKey();
    }

    const lastAccountId = getLastAccountId();
    const currentApiKey = getClientApiKey();
    const expectedApiKey = this.generateApiKey(accountId);

    // 如果账号变化或 API Key 不匹配，则更新
    if (lastAccountId !== accountId || currentApiKey !== expectedApiKey) {
      logWithTime(`账号变化 (${lastAccountId || '无'} -> ${accountId})，更新 API Key`);
      await setClientApiKey(expectedApiKey);
      await setLastAccountId(accountId);
      logWithTime(`API Key 已更新: ${expectedApiKey.substring(0, 11)}...`);
      return expectedApiKey;
    }

    return currentApiKey;
  }

  // 获取当前 API Key（如果存在）
  static getApiKey(): string {
    return getClientApiKey();
  }
}

// ==================== 服务发现 ====================
export class ServerDiscovery {
  // 检查 URL 是否是 coding-usage 服务
  static async checkHealth(url: string): Promise<boolean> {
    try {
      const response = await axios.get(`${url}/api/health`, { timeout: 3000 });
      return response.data && response.data.service === 'coding-usage' && response.data.status === 'ok';
    } catch {
      return false;
    }
  }

  // 从列表中找到第一个可用的 coding-usage 服务
  static async discoverServer(): Promise<string | null> {
    const servers = await fetchServerList();
    for (const url of servers) {
      logWithTime(`检查服务器: ${url}`);
      const isValid = await this.checkHealth(url);
      if (isValid) {
        logWithTime(`发现可用的 coding-usage 服务: ${url}`);
        return url;
      }
    }
    logWithTime('未发现可用的 coding-usage 服务');
    return null;
  }

  // 自动配置 Team Server URL
  static async autoConfigureIfNeeded(): Promise<void> {
    const currentUrl = getTeamServerUrl();

    if (currentUrl) {
      logWithTime(`Team Server URL 已配置: ${currentUrl}`);
      return;
    }

    logWithTime('Team Server URL 未配置，开始自动发现...');
    const discoveredUrl = await this.discoverServer();

    if (discoveredUrl) {
      const appName = getAppDisplayName();
      await setTeamServerUrl(discoveredUrl);
      logWithTime(`已自动配置 Team Server URL: ${discoveredUrl}`);
      vscode.window.showInformationMessage(`${appName} Usage: Auto-configured server ${discoveredUrl}`);
    }
  }
}

// ==================== 团队服务器客户端 ====================
export class TeamServerClient {
  static getConfig() {
    return {
      url: getTeamServerUrl(),
      apiKey: getClientApiKey()
    };
  }

  // 提交 Cursor 使用数据到团队服务器
  static async submitCursorUsage(
    sessionToken: string,
    summary: UsageSummaryResponse,
    billing: BillingCycleResponse,
    aggregatedData?: AggregatedUsageResponse | null
  ): Promise<void> {
    if (!isReportingEnabled()) {
      logWithTime('投递功能未启用，跳过提交');
      return;
    }
    const url = getTeamServerUrl();
    if (!url) return;

    try {
      const apiService = getApiService();
      const me = await apiService.fetchCursorUserInfo(sessionToken);

      // 检查账号变化并更新 API Key（使用 email 作为账号标识）
      const apiKey = await ApiKeyGenerator.checkAndUpdateApiKey(me.email);
      if (!apiKey) return;

      const plan = summary.individualUsage.plan;

      // 从聚合数据计算 API 和 Auto 使用量
      let apiUsageCents = 0;
      let autoUsageCents = 0;
      if (aggregatedData) {
        for (const event of aggregatedData.aggregations) {
          if (event.modelIntent === 'default') {
            autoUsageCents += event.totalCents;
          } else {
            apiUsageCents += event.totalCents;
          }
        }
      }

      // 使用百分比反推限额
      const apiPercentUsed = plan.apiPercentUsed ?? 0;
      const autoPercentUsed = plan.autoPercentUsed ?? 0;
      const apiLimitCents = apiPercentUsed > 0 ? (apiUsageCents / apiPercentUsed) * 100 : 0;
      const autoLimitCents = autoPercentUsed > 0 ? (autoUsageCents / autoPercentUsed) * 100 : 0;

      const body = {
        client_token: apiKey,
        email: me.email,
        expire_time: Number(billing.endDateEpochMillis),
        membership_type: summary.membershipType,
        // API 和 Auto 使用数据（使用百分比和聚合数据）
        api_spend: Math.round(apiUsageCents),
        api_limit: Math.round(apiLimitCents),
        auto_spend: Math.round(autoUsageCents),
        auto_limit: Math.round(autoLimitCents),
        api_percent: apiPercentUsed,
        auto_percent: autoPercentUsed,
        host: os.hostname(),
        platform: os.platform(),
        app_name: vscode.env.appName
      };
      logWithTime(`提交使用数据: ${JSON.stringify(body)}`);
      await axios.post(`${url}/api/cursor-usage`, body, { headers: { 'X-Api-Key': apiKey }, timeout: API_TIMEOUT });
      logWithTime('提交使用数据成功');
    } catch (e) {
      logWithTime(`提交使用数据失败: ${e}`);
    }
  }

  // 提交 Trae 使用数据到团队服务器
  static async submitTraeUsage(email: string, usageData: {
    expire_time: number;
    total_usage: number;
    used_usage: number;
    membership_type: string;
  }): Promise<void> {
    if (!isReportingEnabled()) {
      logWithTime('投递功能未启用，跳过提交');
      return;
    }
    const url = getTeamServerUrl();
    if (!url) return;

    try {
      // 检查账号变化并更新 API Key（使用 user_id/email 作为账号标识）
      const apiKey = await ApiKeyGenerator.checkAndUpdateApiKey(email);
      if (!apiKey) return;

      const body = {
        client_token: apiKey,
        email: email,
        expire_time: usageData.expire_time,
        total_usage: usageData.total_usage,
        used_usage: usageData.used_usage,
        membership_type: usageData.membership_type,
        host: os.hostname(),
        platform: os.platform(),
        app_name: vscode.env.appName
      };
      logWithTime(`提交使用数据: ${JSON.stringify(body)}`);
      await axios.post(`${url}/api/trae-usage`, body, { headers: { 'X-Api-Key': apiKey }, timeout: API_TIMEOUT });
      logWithTime('提交使用数据成功');
    } catch (e) {
      logWithTime(`提交使用数据失败: ${e}`);
    }
  }

  private static teamHint = false;
  static isTeamHintActive() { return this.teamHint; }

  // 检查并更新连接状态
  static async checkAndUpdateConnectionStatus(): Promise<boolean> {
    const { url, apiKey } = this.getConfig();
    if (!url || !apiKey) {
      this.teamHint = false;
      return false;
    }

    try {
      logWithTime('检查团队服务器连接状态...');
      await axios.post(`${url}/api/ping`, { active: true, client_token: apiKey }, { headers: { 'X-Api-Key': apiKey }, timeout: API_TIMEOUT });
      this.teamHint = true;
      logWithTime('团队服务器连接成功');
      return true;
    } catch (error) {
      this.teamHint = false;
      logWithTime(`团队服务器连接失败: ${error}`);
      return false;
    }
  }

  static async ping(active?: boolean): Promise<boolean> {
    const { url, apiKey } = this.getConfig();
    if (!url || !apiKey) return false;
    try {
      // logWithTime(`Ping platform: active=${typeof active === 'undefined' ? 'true' : String(active)}`);
      await axios.post(`${url}/api/ping`, { active, client_token: apiKey }, { headers: { 'X-Api-Key': apiKey }, timeout: API_TIMEOUT });
      if (!this.teamHint && active !== false) this.teamHint = true;
      return true;
    } catch {
      return false;
    }
  }
}

// ==================== Ping 管理器 ====================
export class PingManager {
  private interval: NodeJS.Timeout | null = null;

  start() {
    this.stop();
    this.interval = setInterval(() => TeamServerClient.ping(), 60000);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}
