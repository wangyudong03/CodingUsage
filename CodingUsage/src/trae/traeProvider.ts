import * as vscode from 'vscode';
import {
    logWithTime,
    getAdditionalSessionTokens,
    formatTimeWithoutYear,
    getAppType,
    isShowAllProvidersEnabled,
    filterTokensByIdeType,
} from '../common/utils';
import {
    APP_NAME,
    DOUBLE_CLICK_DELAY,
    FETCH_TIMEOUT
} from '../common/constants';
import {
    IUsageProvider
} from '../common/types';
import {
    TraeApiResponse,
    TraeUsageStats,
    TraeEntitlementPack,
    TraeSecondaryAccountData
} from './types';
import { getTraeApiService } from './traeApiService';
import { TeamServerClient } from '../teamServerClient';
import { getOutputChannel } from '../common/utils';

export class TraeProvider implements IUsageProvider {
    private traeUsageData: TraeApiResponse | null = null;
    private secondaryAccountsData: Map<string, TraeSecondaryAccountData> = new Map();

    private retryTimer: NodeJS.Timeout | null = null;
    private clickTimer: NodeJS.Timeout | null = null;
    private fetchTimeoutTimer: NodeJS.Timeout | null = null;
    private statusBarItem: vscode.StatusBarItem;
    private apiService = getTraeApiService();
    private clickCount = 0;
    private isRefreshing = false;
    private isManualRefresh = false;
    private isAuthFailed = false;

    constructor(private context: vscode.ExtensionContext) {
        this.statusBarItem = this.createStatusBarItem();
        this.initialize();
    }

    private createStatusBarItem(): vscode.StatusBarItem {
        const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        item.command = 'cursorUsage.handleTraeClick';
        item.show();
        return item;
    }

    public initialize(): void {
        this.updateStatusBar();
        this.fetchData();
    }

    public refresh(): void {
        logWithTime('手动刷新开始');
        this.isManualRefresh = true;
        this.isRefreshing = true;
        this.isAuthFailed = false;
        this.setLoadingState();

        this.apiService.clearTraeCache();
        this.fetchData();
    }

    public safeRefresh(): void {
        if (this.isRefreshing) {
            logWithTime('重置可能卡住的刷新状态');
            this.resetRefreshState();
        }
        this.fetchData();
    }

    public isInRefreshingState(): boolean {
        return this.isRefreshing;
    }

    public isAuthenticated(): boolean {
        return !this.isAuthFailed && this.traeUsageData !== null && this.traeUsageData.code !== 1001;
    }

    public handleStatusBarClick(): void {
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

    public showOutput(): void {
        const outputChannel = getOutputChannel();
        outputChannel.show();
    }

    public dispose(): void {
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.clearClickTimer();
        this.clearFetchTimeout();
        this.statusBarItem.dispose();
    }

    private setLoadingState(): void {
        this.statusBarItem.text = '$(loading~spin) Loading...';
        this.statusBarItem.tooltip = 'Refreshing usage data...';
        this.statusBarItem.color = undefined;
    }

    private resetRefreshState(): void {
        this.isManualRefresh = false;
        this.isRefreshing = false;
        this.clearFetchTimeout();
    }

    private async fetchData(retryCount = 0): Promise<void> {
        this.clearFetchTimeout();
        this.fetchTimeoutTimer = setTimeout(() => {
            logWithTime('fetchData 超时，强制重置状态');
            this.resetRefreshState();
            this.updateStatusBar();
            if (this.isManualRefresh) {
                vscode.window.showErrorMessage('Request timeout. Please try again.');
            }
        }, FETCH_TIMEOUT);

        try {
            // 使用自动获取 token（优先从 storage.json，回退到 session 配置）
            await this.fetchTraeDataAuto();
            await this.fetchSecondaryAccountsData();

            this.clearFetchTimeout();
            this.resetRefreshState();
            this.updateStatusBar();
        } catch (error) {
            logWithTime(`fetchData 发生错误: ${error}`);
            this.clearFetchTimeout();
            this.resetRefreshState();
            this.updateStatusBar();
        }
    }

    /**
     * 使用自动 Token 获取 Trae 数据
     */
    private async fetchTraeDataAuto(): Promise<void> {
        try {
            const authToken = await this.apiService.getAutoToken(undefined, 0, this.isManualRefresh);
            if (!authToken) {
                logWithTime('获取 Trae 认证令牌失败');
                this.isAuthFailed = true;
                this.showNotConfiguredStatus();
                return;
            }

            logWithTime('成功获取 Trae 认证令牌');
            const responseData = await this.apiService.getTraeUserEntitlementList(authToken);
            if (responseData) {
                logWithTime('成功获取 Trae 使用量数据');
                this.traeUsageData = responseData;
                this.isAuthFailed = false;

                if (responseData.code !== undefined && responseData.code !== 0) {
                    logWithTime(`Trae API 返回错误: code=${responseData?.code}`);
                    if (responseData.code === 1001) {
                        this.isAuthFailed = true;
                        this.apiService.clearTraeCache();
                        vscode.window.showErrorMessage('Token expired, please try again');
                    } else {
                        vscode.window.showErrorMessage(`Trae API Error: ${responseData.message}`);
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

                if (responseData.code !== undefined && responseData.code !== 0) {
                    logWithTime(`Trae API 返回错误: code=${responseData?.code}`);
                    if (responseData.code === 1001) {
                        this.isAuthFailed = true;
                        this.apiService.clearTraeCache();
                        vscode.window.showErrorMessage('Token expired, please update Session ID');
                    } else {
                        vscode.window.showErrorMessage(`Trae API Error: ${responseData.message}`);
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

    /**
     * 获取副账号数据
     */
    private async fetchSecondaryAccountsData(): Promise<void> {
        const allTokens = getAdditionalSessionTokens();
        // 只过滤出 Trae 格式的 token，避免把 Cursor 的 token 当作 Trae 的来处理
        const additionalTokens = filterTokensByIdeType(allTokens, 'trae');
        logWithTime(`副账号 token 过滤: 总计 ${allTokens.length} 个, Trae 格式 ${additionalTokens.length} 个`);
        this.secondaryAccountsData.clear();

        for (let i = 0; i < additionalTokens.length; i++) {
            const sessionId = additionalTokens[i];
            try {
                logWithTime(`获取副账号 ${i + 1} 数据`);
                const authToken = await this.apiService.getTraeTokenFromSession(sessionId, 0, false);
                if (!authToken) {
                    logWithTime(`副账号 ${i + 1} Token 获取失败`);
                    continue;
                }

                const responseData = await this.apiService.getTraeUserEntitlementList(authToken);
                if (responseData && responseData.code === undefined || responseData?.code === 0) {
                    // 使用 session ID 前8位作为账号标识
                    const accountLabel = `Account ${i + 2} (${sessionId.substring(0, 8)}...)`;
                    this.secondaryAccountsData.set(accountLabel, {
                        usageData: responseData!,
                        sessionId: sessionId
                    });
                    logWithTime(`副账号 ${i + 1} 数据获取成功`);
                }
            } catch (e) {
                logWithTime(`获取副账号 ${i + 1} 数据失败: ${e}`);
            }
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


    private clearFetchTimeout(): void {
        if (this.fetchTimeoutTimer) {
            clearTimeout(this.fetchTimeoutTimer);
            this.fetchTimeoutTimer = null;
        }
    }

    private updateStatusBar(): void {
        if (this.isAuthFailed) {
            this.showAuthFailedStatus();
            return;
        }

        if (!this.traeUsageData || this.traeUsageData.code === 1001) {
            this.showNotConfiguredStatus();
            return;
        }

        const stats = this.calculateTraeUsageStats();
        if (stats.hasValidPacks) {
            this.showTraeUsageStatus(stats);
        } else {
            this.showNoActiveSubscriptionStatus();
        }
    }

    private showAuthFailedStatus(): void {
        const showAll = isShowAllProvidersEnabled();
        if (showAll) {
            this.statusBarItem.hide();
            return;
        }
        this.statusBarItem.show();
        this.statusBarItem.text = `⚠️ ${APP_NAME}: Auth Failed`;
        this.statusBarItem.color = '#ff6b6b';
        this.statusBarItem.tooltip = 'Authentication failed: Session may be invalid or expired\nClick to reconfigure\n\nSingle click: Refresh\nDouble click: Configure';
    }

    private showNoActiveSubscriptionStatus(): void {
        const showAll = isShowAllProvidersEnabled();
        if (showAll) {
            this.statusBarItem.hide();
            return;
        }
        this.statusBarItem.show();
        this.statusBarItem.text = `$(info) ${APP_NAME}: No Active Subscription`;
        this.statusBarItem.color = undefined;
        this.statusBarItem.tooltip = 'No active subscription pack found\n\nSingle click: Refresh\nDouble click: Configure';
    }

    private showNotConfiguredStatus(): void {
        const showAll = isShowAllProvidersEnabled();
        if (showAll) {
            this.statusBarItem.hide();
            return;
        }
        this.statusBarItem.show();
        this.statusBarItem.text = `$(warning) Trae: Not Configured`;
        this.statusBarItem.color = undefined;
        this.statusBarItem.tooltip = 'Click to configure session token\n\nSingle click: Refresh\nDouble click: Configure';
    }

    private showTraeUsageStatus(stats: TraeUsageStats): void {
        const { totalUsage, totalLimit } = stats;
        const remaining = totalLimit - totalUsage;
        const remainingFormatted = remaining.toFixed(1);
        const percentage = totalLimit > 0 ? (totalUsage / totalLimit) * 100 : 0;
        const showAll = isShowAllProvidersEnabled();

        if (showAll) {
            this.statusBarItem.text = `$(trae-logo) ${Math.round(percentage)}%`;
        } else {
            this.statusBarItem.text = `$(trae-logo) Fast: ${totalUsage}/${totalLimit} (${remainingFormatted} Left)`;
        }
        this.statusBarItem.color = undefined;
        this.statusBarItem.tooltip = this.buildTraeDetailedTooltip();
        this.statusBarItem.show();
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

    private buildTraeDetailedTooltip(): vscode.MarkdownString {
        return TraeProvider.buildTraeTooltipFromData(this.traeUsageData, new Date(), this.secondaryAccountsData);
    }

    public static buildTraeTooltipFromData(
        usageData: TraeApiResponse | null,
        currentTime?: Date,
        secondaryAccounts?: Map<string, TraeSecondaryAccountData>
    ): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        md.supportHtml = true;

        if (!usageData || usageData.code === 1001) {
            md.appendMarkdown('Click to configure Session ID\n\nSingle click: Refresh\nDouble click: Configure');
            return md;
        }

        const sections: string[] = [];
        const validPacks = TraeProvider.getTraeValidPacks(usageData.user_entitlement_pack_list);

        if (validPacks.length === 0) {
            sections.push('No valid subscription packs');
        } else {
            const packSections = TraeProvider.buildTraePackSections(validPacks, currentTime);
            sections.push(...packSections);
        }

        // 使用 \n\n 连接各个部分，确保 Markdown 正确换行
        md.appendMarkdown(sections.join('\n\n'));

        // 显示副账号数据
        if (secondaryAccounts && secondaryAccounts.size > 0) {
            md.appendMarkdown('\n\n---\n');
            md.appendMarkdown('**Additional Accounts**\n\n');

            secondaryAccounts.forEach((accData, label) => {
                const accUsageData = accData.usageData;
                const accValidPacks = TraeProvider.getTraeValidPacks(accUsageData.user_entitlement_pack_list);

                if (accValidPacks.length > 0) {
                    // 显示账号标识
                    const subscriptionType = TraeProvider.getTraeSubscriptionTypeLabel(accValidPacks[0]);
                    md.appendMarkdown(`**${label}** (${subscriptionType})\n\n`);

                    // 计算总使用量
                    let totalUsage = 0;
                    let totalLimit = 0;
                    accValidPacks.forEach(pack => {
                        const fastUsed = pack.usage.premium_model_fast_amount;
                        const fastLimit = pack.entitlement_base_info.quota.premium_model_fast_request_limit;
                        if (fastLimit > 0) {
                            totalUsage += fastUsed;
                            totalLimit += fastLimit;
                        }
                    });

                    if (totalLimit > 0) {
                        const progressInfo = TraeProvider.buildProgressBar(totalUsage, totalLimit);
                        const usageFormatted = `${totalUsage.toFixed(0)}/${totalLimit}`;
                        md.appendMarkdown(`Fast (${usageFormatted}) [${progressInfo.progressBar}] ${progressInfo.percentage}%\n\n`);
                    }
                }
            });
        }

        md.appendMarkdown('\n\n---\n\n');
        md.appendMarkdown('[Refresh](command:cursorUsage.refresh) \u00A0\u00A0 [Settings](command:cursorUsage.updateSession)');

        return md;
    }

    public static getTraeValidPacks(packList: TraeEntitlementPack[]): TraeEntitlementPack[] {
        return packList.filter(pack => TraeProvider.hasTraeValidUsageData(pack));
    }

    public static hasTraeValidUsageData(pack: TraeEntitlementPack): boolean {
        const { quota } = pack.entitlement_base_info;
        return quota.premium_model_fast_request_limit > 0 ||
            quota.premium_model_slow_request_limit > 0 ||
            quota.auto_completion_limit > 0 ||
            quota.advanced_model_request_limit > 0;
    }

    public static buildTraePackSections(validPacks: TraeEntitlementPack[], currentTime?: Date): string[] {
        const sections: string[] = [];
        const hintText = TeamServerClient.isTeamHintActive() ? "✅ " : "";

        // 生成时间字符串
        const now = currentTime || new Date();
        const mm = (now.getMonth() + 1).toString().padStart(2, '0');
        const dd = now.getDate().toString().padStart(2, '0');
        const hh = now.getHours().toString().padStart(2, '0');
        const min = now.getMinutes().toString().padStart(2, '0');
        const updateTimeStr = `🕐${mm}/${dd} ${hh}:${min}`;

        // Header line with time
        sections.push(`**Trae Usage** \u00A0\u00A0 ${hintText}${updateTimeStr}`);

        // Build table header
        const header = '| Plan | Usage | Resets |';
        const separator = '| :--- | :--- | :--- |';

        let tableRows = '';
        validPacks.forEach((pack) => {
            const { usage, entitlement_base_info } = pack;
            const { quota } = entitlement_base_info;

            const subscriptionType = TraeProvider.getTraeSubscriptionTypeLabel(pack);
            const fastUsed = usage.premium_model_fast_amount;
            const fastLimit = quota.premium_model_fast_request_limit;

            // 格式化结束时间作为 Resets
            const endTime = formatTimeWithoutYear(entitlement_base_info.end_time, true);

            if (fastLimit > 0) {
                const progressInfo = TraeProvider.buildProgressBar(fastUsed, fastLimit);
                const planLabel = `${subscriptionType}(${fastUsed.toFixed(0)}/${fastLimit})`;
                tableRows += `| ${planLabel} | ${progressInfo.progressBar} ${progressInfo.percentage}% | ${endTime} |\n`;
            }
        });

        if (tableRows) {
            sections.push(`${header}\n${separator}\n${tableRows}`);
        }

        return sections;
    }

    // ... getTraeSubscriptionTypeLabel kept as is ...
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
                    return 'Free';
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

    public static buildProgressBar(used: number, limit: number): { progressBar: string; percentage: number } {
        const percentage = limit > 0 ? Math.round((used / limit) * 100) : 0;
        const progressBarLength = 20;  // Match Antigravity's progress bar width
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
        const updateTime = `🕐${mm}/${dd} ${hh}:${min}`;
        const left = leftText ? `${leftText}` : '';
        const spaceCount = left.includes('Connected') ? 25 : 45;
        return `${left}${' '.repeat(spaceCount)}${updateTime}`;
    }
}













