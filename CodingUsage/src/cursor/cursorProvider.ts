import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';
import initSqlJs from 'sql.js';
import {
    logWithTime,
    formatTimeWithoutYear,
    getAdditionalSessionTokens,
    isShowAllProvidersEnabled,
    filterTokensByIdeType,
} from '../common/utils';
import {
    DOUBLE_CLICK_DELAY,
    FETCH_TIMEOUT
} from '../common/constants';
import {
    IUsageProvider
} from '../common/types';
import {
    UsageSummaryResponse,
    BillingCycleResponse,
    AggregatedUsageResponse,
    SecondaryAccountData
} from './types';
import { getCursorApiService } from './cursorApiService';
import { TeamServerClient } from '../teamServerClient';
import { getOutputChannel } from '../common/utils';

// ==================== Token 自动检测 Helpers ====================
async function getGlobalStorageDbPath(): Promise<string> {
    const platform = os.platform();
    const homeDir = os.homedir();
    const appFolderName = 'Cursor';

    switch (platform) {
        case 'win32': {
            const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
            return path.join(appData, appFolderName, 'User', 'globalStorage', 'state.vscdb');
        }
        case 'darwin':
            return path.join(homeDir, 'Library', 'Application Support', appFolderName, 'User', 'globalStorage', 'state.vscdb');
        default:
            return path.join(homeDir, '.config', appFolderName, 'User', 'globalStorage', 'state.vscdb');
    }
}

async function readAccessTokenFromDb(context: vscode.ExtensionContext): Promise<string | null> {
    try {
        const wasmPath = vscode.Uri.joinPath(context.extensionUri, 'out', 'sql-wasm.wasm').fsPath;
        const dbPath = await getGlobalStorageDbPath();

        if (!await fs.pathExists(dbPath)) {
            logWithTime(`数据库文件不存在: ${dbPath}`);
            return null;
        }

        const SQL = await initSqlJs({ locateFile: () => wasmPath });
        const fileBuffer = await fs.readFile(dbPath);
        const db = new SQL.Database(fileBuffer);
        const res = db.exec(`SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken';`);
        db.close();

        if (res && res.length > 0 && res[0].values && res[0].values.length > 0) {
            const val = res[0].values[0][0];
            return typeof val === 'string' ? val : null;
        }
        return null;
    } catch (error) {
        logWithTime(`读取 accessToken 失败: ${error}`);
        return null;
    }
}

function constructSessionToken(accessToken: string): string | null {
    try {
        const parts = accessToken.split('.');
        if (parts.length !== 3) {
            logWithTime('accessToken 不是有效的 JWT 格式');
            return null;
        }
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
        const sub = payload.sub;
        if (!sub || !sub.includes('|')) {
            logWithTime(`JWT sub 字段格式不正确: ${sub}`);
            return null;
        }
        const userId = sub.split('|')[1];
        return `${userId}%3A%3A${accessToken}`;
    } catch (error) {
        logWithTime(`解析 JWT 失败: ${error}`);
        return null;
    }
}

async function readCachedEmailFromDbLocal(context: vscode.ExtensionContext): Promise<string | null> {
    try {
        const wasmPath = vscode.Uri.joinPath(context.extensionUri, 'out', 'sql-wasm.wasm').fsPath;
        const dbPath = await getGlobalStorageDbPath();

        if (!await fs.pathExists(dbPath)) {
            return null;
        }

        const SQL = await initSqlJs({ locateFile: () => wasmPath });
        const fileBuffer = await fs.readFile(dbPath);
        const db = new SQL.Database(fileBuffer);
        const res = db.exec(`SELECT value FROM ItemTable WHERE key = 'cursorAuth/cachedEmail';`);
        db.close();

        if (res && res.length > 0 && res[0].values && res[0].values.length > 0) {
            const val = res[0].values[0][0];
            return typeof val === 'string' ? val : null;
        }
        return null;
    } catch (error) {
        logWithTime(`读取 cachedEmail 失败: ${error}`);
        return null;
    }
}

export class CursorProvider implements IUsageProvider {
    private billingCycleData: BillingCycleResponse | null = null;
    private summaryData: UsageSummaryResponse | null = null;
    private aggregatedUsageData: AggregatedUsageResponse | null = null;
    private secondaryAccountsData: Map<string, SecondaryAccountData> = new Map();
    private primaryEmail: string | null = null;

    private retryTimer: NodeJS.Timeout | null = null;
    private clickTimer: NodeJS.Timeout | null = null;
    private fetchTimeoutTimer: NodeJS.Timeout | null = null;
    private statusBarItem: vscode.StatusBarItem;
    private apiService = getCursorApiService();
    private clickCount = 0;
    private isRefreshing = false;
    private isManualRefresh = false;

    constructor(private context: vscode.ExtensionContext) {
        this.statusBarItem = this.createStatusBarItem();
        this.initialize();
    }

    private createStatusBarItem(): vscode.StatusBarItem {
        const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        item.command = 'cursorUsage.handleCursorClick';
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
        this.setLoadingState();
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
        return this.summaryData !== null;
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
            const accessToken = await readAccessTokenFromDb(this.context);
            const primaryToken = accessToken ? constructSessionToken(accessToken) : null;

            if (!primaryToken) {
                logWithTime('无法从 DB 获取主账号 token，请确保已登录 Cursor');
                this.showNotConfiguredStatus();
                this.resetRefreshState();
                return;
            }

            this.primaryEmail = await readCachedEmailFromDbLocal(this.context);
            logWithTime(`主账号邮箱: ${this.primaryEmail}`);

            await this.fetchCursorData(primaryToken);
            await this.fetchSecondaryAccountsData();

            this.clearFetchTimeout();
            this.resetRefreshState();
            this.updateStatusBar();
        } catch (error) {
            logWithTime(`fetchData 发生错误: ${error}`);
            this.clearFetchTimeout();
            if (retryCount < 3) {
                setTimeout(() => this.fetchData(retryCount + 1), 1000);
            } else {
                this.resetRefreshState();
                this.updateStatusBar();
            }
        }
    }

    private async fetchCursorData(sessionToken: string): Promise<void> {
        const summary = await this.apiService.fetchCursorUsageSummary(sessionToken);
        const startMillis = new Date(summary.billingCycleStart).getTime();
        const endMillis = new Date(summary.billingCycleEnd).getTime();

        this.billingCycleData = {
            startDateEpochMillis: String(startMillis),
            endDateEpochMillis: String(endMillis)
        };
        this.summaryData = summary;

        try {
            const billingCycle = await this.apiService.fetchCursorBillingCycle(sessionToken);
            const billingStartMillis = parseInt(billingCycle.startDateEpochMillis);
            const aggregatedUsage = await this.apiService.fetchCursorAggregatedUsage(sessionToken, billingStartMillis);
            this.aggregatedUsageData = aggregatedUsage;
        } catch (e) {
            logWithTime(`获取聚合数据失败: ${e}`);
        }

        await TeamServerClient.submitCursorUsage(sessionToken, summary, this.billingCycleData, this.aggregatedUsageData);
    }

    private async fetchSecondaryAccountsData(): Promise<void> {
        const allTokens = getAdditionalSessionTokens();
        // 只过滤出 Cursor 格式的 token，避免把 Trae 的 token 当作 Cursor 的来处理
        const additionalTokens = filterTokensByIdeType(allTokens, 'cursor');
        logWithTime(`副账号 token 过滤: 总计 ${allTokens.length} 个, Cursor 格式 ${additionalTokens.length} 个`);
        this.secondaryAccountsData.clear();

        for (let i = 0; i < additionalTokens.length; i++) {
            const token = additionalTokens[i];
            try {
                const userInfo = await this.apiService.fetchCursorUserInfo(token);
                const email = userInfo.email || `Account ${i + 2}`;

                const summary = await this.apiService.fetchCursorUsageSummary(token);
                let billingCycle: BillingCycleResponse | null = null;
                let aggregatedData: AggregatedUsageResponse | null = null;

                try {
                    billingCycle = await this.apiService.fetchCursorBillingCycle(token);
                    const billingStartMillis = parseInt(billingCycle.startDateEpochMillis);
                    aggregatedData = await this.apiService.fetchCursorAggregatedUsage(token, billingStartMillis);
                } catch (e) { }

                this.secondaryAccountsData.set(email, { summary, billingCycle, aggregatedData });
            } catch (e) {
                logWithTime(`获取副账号数据失败: ${e}`);
            }
        }
    }

    private clearFetchTimeout(): void {
        if (this.fetchTimeoutTimer) {
            clearTimeout(this.fetchTimeoutTimer);
            this.fetchTimeoutTimer = null;
        }
    }

    private updateStatusBar(): void {
        if (!this.summaryData || !this.billingCycleData) {
            return;
        }
        this.showCursorUsageStatus();
    }

    private showNotConfiguredStatus(): void {
        const showAll = isShowAllProvidersEnabled();
        if (showAll) {
            // In Show All mode, hide unauthenticated providers
            this.statusBarItem.hide();
            return;
        }
        this.statusBarItem.show();
        this.statusBarItem.text = `$(warning) Cursor: Not Logged In`;
        this.statusBarItem.color = undefined;
        this.statusBarItem.tooltip = 'Click to configure\n\nSingle click: Refresh\nDouble click: Configure';
    }

    private showCursorUsageStatus(): void {
        if (!this.summaryData || !this.billingCycleData) return;

        const membershipType = this.summaryData.membershipType.toUpperCase();
        const plan = this.summaryData.individualUsage.plan;
        const showAll = isShowAllProvidersEnabled();

        const apiPercentUsed = plan.apiPercentUsed ?? 0;
        const totalPercentUsed = plan.totalPercentUsed ?? 0;

        const { apiUsageCents, autoUsageCents } = this.calculateUsageFromAggregated();
        const apiLimitCents = apiPercentUsed > 0 ? (apiUsageCents / apiPercentUsed) * 100 : 0;

        if (apiPercentUsed > 0 || (plan.autoPercentUsed ?? 0) > 0) {
            const apiUsageDollars = apiUsageCents / 100;
            const apiLimitDollars = apiLimitCents / 100;
            if (showAll) {
                this.statusBarItem.text = `$(cursor-logo) ${Math.round(apiPercentUsed)}%`;
            } else {
                this.statusBarItem.text = `$(cursor-logo) ${membershipType}: $${apiUsageDollars.toFixed(2)}/${apiLimitDollars.toFixed(0)} (${apiPercentUsed.toFixed(1)}%)`;
            }
        } else {
            const usedCents = plan.breakdown?.total ?? plan.used;
            const usedDollars = usedCents / 100;
            const limitDollars = plan.limit / 100;
            if (showAll) {
                this.statusBarItem.text = `$(cursor-logo) ${Math.round(totalPercentUsed)}%`;
            } else {
                this.statusBarItem.text = `$(cursor-logo) ${membershipType}: $${usedDollars.toFixed(2)}/${limitDollars.toFixed(0)} (${totalPercentUsed.toFixed(1)}%)`;
            }
        }

        this.statusBarItem.color = undefined;
        this.statusBarItem.tooltip = this.buildCursorDetailedTooltip();
        this.statusBarItem.show();
    }

    private calculateUsageFromAggregated() {
        return CursorProvider.calculateUsageFromAggregatedStatic(this.aggregatedUsageData);
    }

    public static calculateUsageFromAggregatedStatic(aggregatedData: AggregatedUsageResponse | null): { apiUsageCents: number; autoUsageCents: number } {
        if (!aggregatedData) {
            return { apiUsageCents: 0, autoUsageCents: 0 };
        }

        let apiUsageCents = 0;
        let autoUsageCents = 0;

        for (const event of aggregatedData.aggregations) {
            if (event.modelIntent === 'default') {
                autoUsageCents += event.totalCents || 0;
            } else {
                apiUsageCents += event.totalCents || 0;
            }
        }

        return { apiUsageCents, autoUsageCents };
    }

    private buildCursorDetailedTooltip(): vscode.MarkdownString {
        return CursorProvider.buildCursorTooltipFromData(
            this.summaryData,
            this.billingCycleData,
            this.aggregatedUsageData,
            this.secondaryAccountsData,
            this.primaryEmail,
            new Date()
        );
    }

    public static buildCursorTooltipFromData(
        summary: UsageSummaryResponse | null,
        billing: BillingCycleResponse | null,
        aggregatedData: AggregatedUsageResponse | null,
        secondaryAccounts?: Map<string, SecondaryAccountData>,
        primaryEmail?: string | null,
        currentTime?: Date
    ): vscode.MarkdownString {
        if (!summary || !billing) {
            return new vscode.MarkdownString('Primary account not detected. Please ensure you are logged in to Cursor.\n\nSingle click: Refresh\nDouble click: Settings');
        }

        const membershipType = summary.membershipType.toUpperCase();
        const label = CursorProvider.getCursorSubscriptionTypeLabel(membershipType);
        const plan = summary.individualUsage.plan;
        const startTime = formatTimeWithoutYear(Number(billing.startDateEpochMillis));
        const endTime = formatTimeWithoutYear(Number(billing.endDateEpochMillis));
        const billingPeriod = `${startTime}-${endTime}`;

        const md = new vscode.MarkdownString();
        md.supportHtml = true;
        md.isTrusted = true;

        const { apiUsageCents, autoUsageCents } = CursorProvider.calculateUsageFromAggregatedStatic(aggregatedData);

        const apiPercentUsed = plan.apiPercentUsed ?? 0;
        const autoPercentUsed = plan.autoPercentUsed ?? 0;
        const totalPercentUsed = plan.totalPercentUsed ?? 0;

        const apiLimitCents = apiPercentUsed > 0 ? (apiUsageCents / apiPercentUsed) * 100 : 0;
        const autoLimitCents = autoPercentUsed > 0 ? (autoUsageCents / autoPercentUsed) * 100 : 0;

        const hintText = TeamServerClient.isTeamHintActive() ? "✅Connect " : "";
        const now = currentTime || new Date();
        const mm = (now.getMonth() + 1).toString().padStart(2, '0');
        const dd = now.getDate().toString().padStart(2, '0');
        const hh = now.getHours().toString().padStart(2, '0');
        const min = now.getMinutes().toString().padStart(2, '0');
        const updateTime = `🕐${mm}/${dd} ${hh}:${min}`;

        if (apiPercentUsed > 0) {
            const apiUsageDollars = apiUsageCents / 100;
            const apiLimitDollars = apiLimitCents / 100;
            const apiProgressInfo = CursorProvider.buildProgressBarFromPercent(apiPercentUsed);

            md.appendMarkdown(`${label}  📅${billingPeriod}\u00A0\u00A0${hintText}${updateTime}\n\n`);
            md.appendMarkdown(`API ($${apiUsageDollars.toFixed(2)}/${apiLimitDollars.toFixed(0)}) \u00A0\u00A0\u00A0[${apiProgressInfo.progressBar}] ${apiPercentUsed.toFixed(1)}%\n`);
        }

        if (autoPercentUsed > 0) {
            const autoUsageDollars = autoUsageCents / 100;
            const autoLimitDollars = autoLimitCents / 100;
            const autoProgressInfo = CursorProvider.buildProgressBarFromPercent(autoPercentUsed);

            md.appendMarkdown('\n');
            md.appendMarkdown(`Auto($${autoUsageDollars.toFixed(2)}/${autoLimitDollars.toFixed(0)}) [${autoProgressInfo.progressBar}] ${autoPercentUsed.toFixed(1)}%\n`);
        }

        if (apiPercentUsed === 0 && autoPercentUsed === 0) {
            const usedDollars = (plan.breakdown?.total ?? plan.used) / 100;
            const limitDollars = plan.limit / 100;
            const progressInfo = CursorProvider.buildProgressBar(usedDollars, limitDollars);

            md.appendMarkdown(`${label} ($${usedDollars.toFixed(2)}/${limitDollars.toFixed(0)})  📅${billingPeriod}\u00A0\u00A0${hintText}${updateTime}\n`);
            md.appendMarkdown(`[${progressInfo.progressBar}] ${totalPercentUsed.toFixed(1)}%\n`);
        }

        const onDemand = summary.individualUsage.onDemand;
        if (onDemand && onDemand.enabled && onDemand.limit !== null) {
            const onDemandUsedDollars = onDemand.used / 100;
            const onDemandLimitDollars = onDemand.limit / 100;
            const onDemandPercent = onDemand.limit > 0 ? (onDemand.used / onDemand.limit) * 100 : 0;
            const onDemandProgressInfo = CursorProvider.buildProgressBarFromPercent(onDemandPercent);

            md.appendMarkdown('\n');
            md.appendMarkdown(`ODM ($${onDemandUsedDollars.toFixed(2)}/${onDemandLimitDollars.toFixed(0)}) [${onDemandProgressInfo.progressBar}] ${onDemandPercent.toFixed(1)}%\n`);
        }

        if (aggregatedData && aggregatedData.aggregations && aggregatedData.aggregations.length > 0) {
            const headers = ['Model', 'In', 'Out', 'Write', 'Read', 'Cost'];
            const rows: string[][] = [];
            const sortedAggregations = [...aggregatedData.aggregations].sort((a, b) => b.totalCents - a.totalCents);

            for (const agg of sortedAggregations) {
                const modelName = CursorProvider.shortenModelName(agg.modelIntent);
                const inputTokens = parseInt(agg.inputTokens || '0');
                const outputTokens = parseInt(agg.outputTokens || '0');
                const cacheWriteTokens = parseInt(agg.cacheWriteTokens || '0');
                const cacheReadTokens = parseInt(agg.cacheReadTokens || '0');
                const costDollars = (agg.totalCents || 0) / 100;

                rows.push([
                    modelName,
                    CursorProvider.formatTokenCount(inputTokens),
                    CursorProvider.formatTokenCount(outputTokens),
                    CursorProvider.formatTokenCount(cacheWriteTokens),
                    CursorProvider.formatTokenCount(cacheReadTokens),
                    `$${costDollars.toFixed(2)}`
                ]);
            }

            const totalInput = parseInt(aggregatedData.totalInputTokens || '0');
            const totalOutput = parseInt(aggregatedData.totalOutputTokens || '0');
            const totalCacheWrite = parseInt(aggregatedData.totalCacheWriteTokens || '0');
            const totalCacheRead = parseInt(aggregatedData.totalCacheReadTokens || '0');
            const totalCost = aggregatedData.totalCostCents / 100;

            rows.push([
                'Total',
                CursorProvider.formatTokenCount(totalInput),
                CursorProvider.formatTokenCount(totalOutput),
                CursorProvider.formatTokenCount(totalCacheWrite),
                CursorProvider.formatTokenCount(totalCacheRead),
                `$${totalCost.toFixed(2)}`
            ]);

            md.appendMarkdown('\n');
            md.appendCodeblock(CursorProvider.generateMultiRowAsciiTable(headers, rows), 'text');
        }

        if (secondaryAccounts && secondaryAccounts.size > 0) {
            md.appendMarkdown('\n---\n');
            md.appendMarkdown('**Additional Accounts**\n\n');

            secondaryAccounts.forEach((accData, email) => {
                const accSummary = accData.summary;
                const accBilling = accData.billingCycle;
                const accAggregated = accData.aggregatedData;
                const accPlan = accSummary.individualUsage.plan;
                const shortEmail = email.length > 25 ? email.substring(0, 22) + '...' : email;
                const accMembership = accSummary.membershipType.toUpperCase();
                const accLabel = CursorProvider.getCursorSubscriptionTypeLabel(accMembership);

                let billingPeriod = '';
                if (accBilling) {
                    const startTime = formatTimeWithoutYear(Number(accBilling.startDateEpochMillis));
                    const endTime = formatTimeWithoutYear(Number(accBilling.endDateEpochMillis));
                    billingPeriod = ` 📅${startTime}-${endTime}`;
                }

                const apiPercent = accPlan.apiPercentUsed ?? 0;
                const autoPercent = accPlan.autoPercentUsed ?? 0;
                const totalPercent = accPlan.totalPercentUsed ?? 0;

                let apiUsedCents = 0;
                let autoUsedCents = 0;
                if (accAggregated && accAggregated.aggregations) {
                    for (const event of accAggregated.aggregations) {
                        if (event.modelIntent === 'default') {
                            autoUsedCents += event.totalCents || 0;
                        } else {
                            apiUsedCents += event.totalCents || 0;
                        }
                    }
                }

                const apiLimitCents = apiPercent > 0 ? (apiUsedCents / apiPercent) * 100 : 0;
                const autoLimitCents = autoPercent > 0 ? (autoUsedCents / autoPercent) * 100 : 0;

                md.appendMarkdown(`**${shortEmail}** (${accLabel})${billingPeriod}\n\n`);

                if (apiPercent > 0) {
                    const apiUsageDollars = apiUsedCents / 100;
                    const apiLimitDollars = apiLimitCents / 100;
                    const apiProgressInfo = CursorProvider.buildProgressBarFromPercent(apiPercent);
                    md.appendMarkdown(`API ($${apiUsageDollars.toFixed(2)}/${apiLimitDollars.toFixed(0)}) \u00A0\u00A0\u00A0[${apiProgressInfo.progressBar}] ${apiPercent.toFixed(1)}%\n\n`);
                }

                if (autoPercent > 0) {
                    const autoUsageDollars = autoUsedCents / 100;
                    const autoLimitDollars = autoLimitCents / 100;
                    const autoProgressInfo = CursorProvider.buildProgressBarFromPercent(autoPercent);
                    md.appendMarkdown(`Auto($${autoUsageDollars.toFixed(2)}/${autoLimitDollars.toFixed(0)}) [${autoProgressInfo.progressBar}] ${autoPercent.toFixed(1)}%\n\n`);
                }

                if (apiPercent === 0 && autoPercent === 0 && totalPercent > 0) {
                    const totalUsedCents = accPlan.breakdown?.total ?? accPlan.used ?? 0;
                    const totalLimitCents = accPlan.limit ?? 0;
                    const usedDollars = totalUsedCents / 100;
                    const limitDollars = totalLimitCents / 100;
                    const totalProgressInfo = CursorProvider.buildProgressBarFromPercent(totalPercent);
                    md.appendMarkdown(`Total ($${usedDollars.toFixed(2)}/${limitDollars.toFixed(0)}) [${totalProgressInfo.progressBar}] ${totalPercent.toFixed(1)}%\n\n`);
                }

                const onDemand = accSummary.individualUsage.onDemand;
                if (onDemand && onDemand.enabled && onDemand.limit !== null) {
                    const odmUsedDollars = onDemand.used / 100;
                    const odmLimitDollars = onDemand.limit / 100;
                    const odmPercent = onDemand.limit > 0 ? (onDemand.used / onDemand.limit) * 100 : 0;
                    const odmProgressInfo = CursorProvider.buildProgressBarFromPercent(odmPercent);
                    md.appendMarkdown(`ODM ($${odmUsedDollars.toFixed(2)}/${odmLimitDollars.toFixed(0)}) [${odmProgressInfo.progressBar}] ${odmPercent.toFixed(1)}%\n\n`);
                }
            });
        }

        md.appendMarkdown('\n---\n');
        md.appendMarkdown('[Refresh](command:cursorUsage.refresh) \u00A0\u00A0 [Settings](command:cursorUsage.updateSession)');

        return md;
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

    public static buildProgressBarFromPercent(percent: number): { progressBar: string; percentage: number } {
        const progressBarLength = 30;
        const filledLength = Math.round((percent / 100) * progressBarLength);
        const clampedFilled = Math.max(0, Math.min(filledLength, progressBarLength));
        const progressBar = '█'.repeat(clampedFilled) + '░'.repeat(progressBarLength - clampedFilled);
        return { progressBar, percentage: Math.round(percent) };
    }

    public static buildProgressBar(used: number, limit: number): { progressBar: string; percentage: number } {
        const percentage = limit > 0 ? Math.round((used / limit) * 100) : 0;
        const progressBarLength = 15;
        const filledLength = limit > 0 ? Math.round((used / limit) * progressBarLength) : 0;
        const clampedFilled = Math.max(0, Math.min(filledLength, progressBarLength));
        const progressBar = '█'.repeat(clampedFilled) + '░'.repeat(progressBarLength - clampedFilled);
        return { progressBar, percentage };
    }

    public static shortenModelName(modelIntent: string): string {
        const mappings: Record<string, string> = {
            'claude-4.5-opus-high-thinking': 'opus-4.5',
            'claude-4.5-sonnet-thinking': 'sonnet-4.5',
            'claude-4-opus-thinking': 'opus-4',
            'claude-4-sonnet-thinking': 'sonnet-4',
            'claude-3.5-sonnet': 'sonnet-3.5',
            'claude-3-5-sonnet': 'sonnet-3.5',
            'claude-3-opus': 'opus-3',
            'gpt-5.2': 'gpt-5.2',
            'gpt-4-turbo': 'gpt-4t',
            'gpt-4o': 'gpt-4o',
            'gpt-4o-mini': 'gpt-4o-m',
            'default': 'auto'
        };

        if (mappings[modelIntent]) {
            return mappings[modelIntent];
        }
        if (modelIntent.length > 12) {
            return modelIntent.substring(0, 10) + '..';
        }
        return modelIntent;
    }

    public static formatTokenCount(count: number): string {
        if (count >= 1000000) {
            return `${(count / 1000000).toFixed(2)}M`;
        } else if (count >= 1000) {
            return `${(count / 1000).toFixed(1)}K`;
        }
        return String(count);
    }

    private static generateMultiRowAsciiTable(headers: string[], rows: string[][]): string {
        const colWidths = headers.map((header, colIndex) => {
            const maxRowWidth = Math.max(...rows.map(row => (row[colIndex] || '').length));
            return Math.max(header.length, maxRowWidth) + 2;
        });

        const buildRow = (items: string[]) => {
            return '│' + items.map((item, i) => {
                const padding = colWidths[i] - item.length;
                const leftPad = Math.floor(padding / 2);
                const rightPad = padding - leftPad;
                return ' '.repeat(leftPad) + item + ' '.repeat(rightPad);
            }).join('│') + '│';
        };

        const buildSeparator = (start: string, mid: string, end: string, line: string) => {
            return start + colWidths.map(w => line.repeat(w)).join(mid) + end;
        };

        const top = buildSeparator('┌', '┬', '┐', '─');
        const headerSep = buildSeparator('├', '┼', '┤', '─');
        const bottom = buildSeparator('└', '┴', '┘', '─');

        const result = [top, buildRow(headers), headerSep];
        rows.forEach(row => {
            result.push(buildRow(row));
        });
        result.push(bottom);

        return result.join('\n');
    }
}














