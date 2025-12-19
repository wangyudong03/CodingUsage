import * as vscode from 'vscode';
import axios from 'axios';
import { logWithTime, isRetryableError, getAppType, AppType } from './utils';

// ==================== Cursor 类型定义 ====================
export interface BillingCycleResponse {
  startDateEpochMillis: string;
  endDateEpochMillis: string;
}

export interface UsageSummaryResponse {
  billingCycleStart: string;
  billingCycleEnd: string;
  membershipType: string;
  limitType?: string;
  isUnlimited?: boolean;
  autoModelSelectedDisplayMessage?: string;
  namedModelSelectedDisplayMessage?: string;
  individualUsage: {
    plan: {
      enabled: boolean;
      used: number;
      limit: number;
      remaining: number;
      breakdown?: {
        included: number;
        bonus: number;
        total: number;
      };
      // 使用百分比（新 API 格式）
      autoPercentUsed?: number;
      apiPercentUsed?: number;
      totalPercentUsed?: number;
    };
    onDemand?: {
      enabled: boolean;
      used: number;
      limit: number | null;
      remaining: number | null;
    };
  };
  teamUsage?: Record<string, unknown>;
}

// Cursor 聚合使用事件
export interface AggregatedUsageEvent {
  modelIntent: string;
  inputTokens?: string;
  outputTokens?: string;
  cacheWriteTokens?: string;
  cacheReadTokens?: string;
  totalCents: number;
}

export interface AggregatedUsageResponse {
  aggregations: AggregatedUsageEvent[];
  totalInputTokens: string;
  totalOutputTokens: string;
  totalCacheWriteTokens: string;
  totalCacheReadTokens: string;
  totalCostCents: number;
}

export interface UserInfoResponse {
  authId: string;
  userId: number;
  email: string;
  workosId: string;
  createdAt: string;
  isEnterpriseUser: boolean;
}

// ==================== Trae 类型定义 ====================
export interface TraeUsageData {
  advanced_model_amount: number;
  advanced_model_request_usage: number;
  auto_completion_amount: number;
  auto_completion_usage: number;
  is_flash_consuming: boolean;
  premium_model_fast_amount: number;
  premium_model_fast_request_usage: number;
  premium_model_slow_amount: number;
  premium_model_slow_request_usage: number;
}

export interface TraeQuotaData {
  advanced_model_request_limit: number;
  auto_completion_limit: number;
  premium_model_fast_request_limit: number;
  premium_model_slow_request_limit: number;
}

export interface TraeEntitlementPack {
  entitlement_base_info: {
    end_time: number;
    quota: TraeQuotaData;
    user_id: string;
    start_time: number;
    product_type?: number;
    entitlement_id?: string;
    charge_amount?: number;
    currency?: number;
    product_extra?: any;
  };
  usage: TraeUsageData;
  status: number;
  expire_time?: number;
  is_last_period?: boolean;
  next_billing_time?: number;
  source_id?: string;
  yearly_expire_time?: number;
}

export interface TraeApiResponse {
  code?: number;
  message?: string;
  is_pay_freshman: boolean;
  user_entitlement_pack_list: TraeEntitlementPack[];
}

export interface TraeTokenResponse {
  ResponseMetadata: {
    RequestId: string;
    TraceID: string;
    Action: string;
    Version: string;
    Source: string;
    Service: string;
    Region: string;
    WID: null;
    OID: null;
    Error?: {
      Code: string;
      Message: string;
    };
  };
  Result: {
    Token: string;
    ExpiredAt: string;
    UserID: string;
    TenantID: string;
  };
}

// ==================== 常量定义 ====================
// Cursor API
const CURSOR_API_BASE_URL = 'https://cursor.com/api';

// Trae API
const TRAE_DEFAULT_HOST = 'https://api-sg-central.trae.ai';
const TRAE_FALLBACK_HOST = 'https://api-us-east.trae.ai';
const TRAE_TOKEN_ERROR_CODE = '20310';

// 通用配置
const API_TIMEOUT = 5000;
const MAX_RETRY_COUNT = 5;
const RETRY_DELAY = 1000;

/**
 * 统一的API服务类，管理 Cursor 和 Trae API 接口调用
 */
export class ApiService {
  private static instance: ApiService;

  // Trae 专用缓存
  private cachedTraeToken: string | null = null;
  private cachedTraeSessionId: string | null = null;
  private traeHasSwitchedHost: boolean = false;
  private traeCurrentHost: string = TRAE_DEFAULT_HOST;

  private constructor() { }

  public static getInstance(): ApiService {
    if (!ApiService.instance) {
      ApiService.instance = new ApiService();
    }
    return ApiService.instance;
  }

  // ==================== Cursor API ====================

  /**
   * 创建 Cursor 请求头
   */
  private createCursorHeaders(sessionToken: string, referer: string = 'https://cursor.com/dashboard') {
    return {
      'Cookie': `WorkosCursorSessionToken=${sessionToken}`,
      'Content-Type': 'application/json',
      'Origin': 'https://cursor.com',
      'Referer': referer
    };
  }

  /**
   * 获取 Cursor 使用摘要
   */
  public async fetchCursorUsageSummary(sessionToken: string): Promise<UsageSummaryResponse> {
    const response = await axios.get<UsageSummaryResponse>(
      `${CURSOR_API_BASE_URL}/usage-summary`,
      {
        headers: this.createCursorHeaders(sessionToken, 'https://cursor.com'),
        timeout: API_TIMEOUT
      }
    );
    logWithTime('获取 Cursor 使用汇总成功');
    return response.data;
  }

  /**
   * 获取 Cursor 用户信息
   */
  public async fetchCursorUserInfo(sessionToken: string): Promise<UserInfoResponse> {
    const response = await axios.get(
      `${CURSOR_API_BASE_URL}/dashboard/get-me`,
      {
        headers: this.createCursorHeaders(sessionToken, 'https://cursor.com'),
        timeout: API_TIMEOUT
      }
    );
    return response.data;
  }

  /**
   * 获取 Cursor 当前账单周期
   */
  public async fetchCursorBillingCycle(sessionToken: string): Promise<BillingCycleResponse> {
    const response = await axios.post<BillingCycleResponse>(
      `${CURSOR_API_BASE_URL}/dashboard/get-current-billing-cycle`,
      {},
      {
        headers: this.createCursorHeaders(sessionToken),
        timeout: API_TIMEOUT
      }
    );
    logWithTime('获取 Cursor 账单周期成功');
    return response.data;
  }

  /**
   * 获取 Cursor 聚合使用事件
   */
  public async fetchCursorAggregatedUsage(sessionToken: string, startDateEpochMillis: number): Promise<AggregatedUsageResponse> {
    const response = await axios.post<AggregatedUsageResponse>(
      `${CURSOR_API_BASE_URL}/dashboard/get-aggregated-usage-events`,
      {
        teamId: -1,
        startDate: startDateEpochMillis
      },
      {
        headers: this.createCursorHeaders(sessionToken),
        timeout: API_TIMEOUT
      }
    );
    logWithTime('获取 Cursor 聚合使用数据成功');
    return response.data;
  }

  // ==================== Trae API ====================

  /**
   * 获取 Trae 用户Token（带缓存功能）
   */
  public async getTraeTokenFromSession(sessionId: string, retryCount = 0, isManualRefresh = false): Promise<string | null> {
    // 检查缓存
    if (this.cachedTraeToken && this.cachedTraeSessionId === sessionId) {
      return this.cachedTraeToken;
    }

    const currentHost = this.traeCurrentHost;

    try {
      const response = await axios.post<TraeTokenResponse>(
        `${currentHost}/cloudide/api/v3/common/GetUserToken`,
        {},
        {
          headers: {
            'Cookie': `X-Cloudide-Session=${sessionId}`,
            'Host': new URL(currentHost).hostname,
            'Content-Type': 'application/json'
          },
          timeout: API_TIMEOUT
        }
      );

      logWithTime('更新 Trae Token');
      this.cachedTraeToken = response.data.Result.Token;
      this.cachedTraeSessionId = sessionId;
      return this.cachedTraeToken;
    } catch (error) {
      return this.handleTraeTokenError(error, sessionId, retryCount, currentHost, isManualRefresh);
    }
  }

  /**
   * 处理 Trae Token 获取错误
   */
  private async handleTraeTokenError(
    error: any,
    sessionId: string,
    retryCount: number,
    currentHost: string,
    isManualRefresh: boolean = false
  ): Promise<string | null> {
    logWithTime(`获取 Trae Token 失败 (尝试 ${retryCount + 1}/${MAX_RETRY_COUNT}): ${error.code}, ${error.message}`);

    // 处理401认证失败情况
    if (error.response?.status === 401) {
      logWithTime('检测到401认证失败，可能是sessionId无效或已过期');
      if (isManualRefresh) {
        vscode.window.showErrorMessage(
          '认证失败：Session ID可能无效或已过期，请更新Session ID',
          '更新Session ID'
        ).then(selection => {
          if (selection === '更新Session ID') {
            vscode.commands.executeCommand('cursorUsage.updateSession');
          }
        });
      } else {
        vscode.window.showErrorMessage('Trae Usage: 认证失败，请手动更新Session ID');
      }
      return null;
    }

    // 处理Token错误（支持双向切换主机）
    if (this.isTraeTokenError(error)) {
      if (!this.traeHasSwitchedHost) {
        const otherHost = currentHost === TRAE_DEFAULT_HOST ? TRAE_FALLBACK_HOST : TRAE_DEFAULT_HOST;
        logWithTime(`检测到错误代码${TRAE_TOKEN_ERROR_CODE}，尝试切换到备用主机: ${otherHost}`);
        this.traeCurrentHost = otherHost;
        this.traeHasSwitchedHost = true;
        return this.getTraeTokenFromSession(sessionId, 0);
      } else {
        if (isManualRefresh) {
          vscode.window.showErrorMessage('Cannot get token, please check network connection or update Session ID');
        } else {
          vscode.window.showErrorMessage('Trae Usage: 无法获取认证Token，请检查网络连接或手动更新Session ID');
        }
        return null;
      }
    }

    // 可重试错误逻辑
    if (this.isRetryableError(error) && retryCount < MAX_RETRY_COUNT) {
      logWithTime(`Token获取失败，将在1秒后进行第${retryCount + 1}次重试`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return this.getTraeTokenFromSession(sessionId, retryCount + 1);
    }

    if (this.isRetryableError(error) && retryCount >= MAX_RETRY_COUNT) {
      if (isManualRefresh) {
        vscode.window.showErrorMessage('Network unstable, please try again later');
      } else {
        vscode.window.showErrorMessage('Trae Usage: 网络不稳定，请稍后重试');
      }
    }

    return null;
  }

  /**
   * 获取 Trae 用户信息（使用缓存的 Token）
   */
  public async fetchTraeUserInfo(sessionId?: string): Promise<{ userId: string; email?: string }> {
    try {
      // 如果没有提供 sessionId，尝试从缓存或配置中获取
      let currentSessionId = sessionId || this.cachedTraeSessionId;

      // 如果缓存中没有，尝试从全局配置获取
      if (!currentSessionId) {
        const { getSessionToken } = await import('./utils');
        const configSessionId = getSessionToken();
        if (configSessionId) {
          currentSessionId = configSessionId;
        }
      }

      if (!currentSessionId) {
        throw new Error('Session ID not found');
      }

      // 获取 Trae Token（会更新缓存）
      const traeToken = await this.getTraeTokenFromSession(currentSessionId);
      if (!traeToken) {
        throw new Error('Failed to get Trae token');
      }

      // 直接从 TraeTokenResponse 接口获取 UserID
      // 这里我们需要重新调用 API 来获取完整响应
      const traeTokenResponse = await this.apiRequestWithRetry(async () => {
        const response = await axios.post<TraeTokenResponse>(
          `${this.traeCurrentHost}/cloudide/api/v3/common/GetUserToken`,
          {},
          {
            headers: {
              'Cookie': `X-Cloudide-Session=${currentSessionId}`,
              'Host': new URL(this.traeCurrentHost).hostname,
              'Content-Type': 'application/json'
            },
            timeout: API_TIMEOUT
          }
        );
        return response.data;
      }, '获取 Trae 用户 Token 响应');

      return {
        userId: traeTokenResponse.Result.UserID,
        email: traeTokenResponse.Result.UserID // Trae 使用 UserID 作为标识符
      };
    } catch (error) {
      logWithTime(`获取 Trae 用户信息失败: ${error}`);
      throw error;
    }
  }

  /**
   * 获取 Trae 用户当前权益列表
   */
  public async getTraeUserEntitlementList(authToken: string): Promise<TraeApiResponse | null> {
    try {
      const result = await this.apiRequestWithRetry(async () => {
        const response = await axios.post(
          `${this.traeCurrentHost}/trae/api/v1/pay/user_current_entitlement_list`,
          {},
          {
            headers: {
              'authorization': `Cloud-IDE-JWT ${authToken}`,
              'Host': new URL(this.traeCurrentHost).hostname,
              'Content-Type': 'application/json'
            },
            timeout: API_TIMEOUT
          }
        );
        return response.data;
      }, '获取用户权益列表');

      return result;
    } catch (error) {
      logWithTime(`获取用户权益列表失败: ${error}`);
      throw error;
    }
  }

  /**
   * 清除 Trae 缓存
   */
  public clearTraeCache(): void {
    this.cachedTraeToken = null;
    this.cachedTraeSessionId = null;
    this.traeHasSwitchedHost = false;
    this.traeCurrentHost = TRAE_DEFAULT_HOST;
  }

  /**
   * 重置 Trae 为默认主机地址
   */
  public async resetTraeToDefaultHost(): Promise<void> {
    this.traeHasSwitchedHost = false;
    this.traeCurrentHost = TRAE_DEFAULT_HOST;
    logWithTime(`Trae 主机地址已重置为: ${TRAE_DEFAULT_HOST}`);
  }

  // ==================== 通用方法 ====================

  /**
   * 带重试机制的通用API请求函数
   */
  public async apiRequestWithRetry<T>(
    requestFn: () => Promise<T>,
    operationName: string,
    maxRetries: number = MAX_RETRY_COUNT
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await requestFn();
        if (attempt > 1) {
          logWithTime(`${operationName} 在第${attempt}次尝试后成功`);
        }
        return result;
      } catch (error) {
        lastError = error;
        logWithTime(`${operationName} 第${attempt}次尝试失败: ${String(error)}`);

        if (attempt < maxRetries) {
          const delay = RETRY_DELAY * attempt;
          logWithTime(`等待${delay}ms后进行第${attempt + 1}次重试`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`${operationName} 在${maxRetries}次重试后仍然失败: ${String(lastError)}`);
  }

  /**
   * 检查是否是 Trae Token 错误
   */
  private isTraeTokenError(error: any): boolean {
    return error?.response?.data?.ResponseMetadata?.Error?.Code === TRAE_TOKEN_ERROR_CODE;
  }

  /**
   * 检查是否是可重试的错误
   */
  public isRetryableError(error: any): boolean {
    return isRetryableError(error);
  }

  /**
   * 统一的错误处理方法
   */
  public handleApiError(error: any, operationName: string, showUserMessage: boolean = false): void {
    const errorMessage = `${operationName}失败: ${String(error)}`;
    logWithTime(errorMessage);

    if (showUserMessage) {
      if (this.isRetryableError(error)) {
        vscode.window.showErrorMessage('Network unstable, please try again later');
      } else {
        vscode.window.showErrorMessage(`${operationName}失败，请稍后重试`);
      }
    }
  }

  /**
   * 检查API响应是否成功
   */
  public isApiResponseSuccess(response: any): boolean {
    return response && (!response.code || response.code === 0);
  }

  /**
   * 处理 Trae API 响应错误
   */
  public handleTraeApiResponseError(response: any, operationName: string): void {
    if (response?.code === 1001) {
      logWithTime(`${operationName}: Token已失效(code: 1001)`);
      this.clearTraeCache();
      vscode.window.showErrorMessage('Token expired, please update Session ID');
    } else if (response?.code) {
      logWithTime(`${operationName}: API返回错误码 ${response.code}, 消息: ${response.message || 'Unknown error'}`);
      vscode.window.showErrorMessage(`${operationName}失败: ${response.message || 'Unknown error'}`);
    }
  }
}

/**
 * 获取API服务实例的便捷函数
 */
export function getApiService(): ApiService {
  return ApiService.getInstance();
}
