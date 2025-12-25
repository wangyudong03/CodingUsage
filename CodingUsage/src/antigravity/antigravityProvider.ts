import * as vscode from 'vscode';
import { IUsageProvider } from '../common/types';
import { logWithTime, getOutputChannel, isShowAllProvidersEnabled } from '../common/utils';
import { DOUBLE_CLICK_DELAY, FETCH_TIMEOUT } from '../common/constants';
import { QuotaSnapshot, ModelQuotaInfo } from './types';
import { DatabaseReader } from './databaseReader';

export class AntigravityProvider implements IUsageProvider {
    private quotaData: QuotaSnapshot | null = null;
    private statusBarItem: vscode.StatusBarItem;
    private databaseReader = new DatabaseReader();

    private clickCount = 0;
    private clickTimer: NodeJS.Timeout | null = null;
    private fetchTimeoutTimer: NodeJS.Timeout | null = null;
    private pollingTimer: NodeJS.Timeout | null = null;
    private readonly POLLING_INTERVAL = 10 * 1000; // 10秒，与DbMonitor一致
    private isRefreshing = false;
    private isManualRefresh = false;

    constructor(private context: vscode.ExtensionContext) {
        this.statusBarItem = this.createStatusBarItem();
        this.initialize();
    }

    private createStatusBarItem(): vscode.StatusBarItem {
        const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
        item.command = 'cursorUsage.handleAntigravityClick';
        item.show();
        return item;
    }

    public initialize(): void {
        this.updateStatusBar();
        this.fetchData();
        this.startPolling();
    }

    private startPolling(): void {
        this.stopPolling();
        this.pollingTimer = setInterval(() => {
            if (!this.isRefreshing) {
                this.fetchData();
            }
        }, this.POLLING_INTERVAL);
    }

    private stopPolling(): void {
        if (this.pollingTimer) {
            clearInterval(this.pollingTimer);
            this.pollingTimer = null;
        }
    }

    public refresh(): void {
        logWithTime('[Antigravity] 手动刷新开始');
        this.isManualRefresh = true;
        this.isRefreshing = true;
        this.setLoadingState();
        this.fetchData();
    }

    public safeRefresh(): void {
        if (this.isRefreshing) {
            this.resetRefreshState();
        }
        this.fetchData();
    }

    public isInRefreshingState(): boolean {
        return this.isRefreshing;
    }

    public isAuthenticated(): boolean {
        return this.quotaData !== null;
    }

    public handleStatusBarClick(): void {
        if (this.isRefreshing) return;

        this.clickCount++;
        if (this.clickTimer) {
            clearTimeout(this.clickTimer);
            this.clickTimer = null;
            this.clickCount = 0;
            vscode.commands.executeCommand('cursorUsage.updateSession');
        } else {
            this.clickTimer = setTimeout(() => {
                if (this.clickCount === 1) {
                    this.refresh();
                }
                this.clickCount = 0;
                this.clickTimer = null;
            }, DOUBLE_CLICK_DELAY);
        }
    }

    public showOutput(): void {
        getOutputChannel().show();
    }

    public dispose(): void {
        this.stopPolling();
        this.statusBarItem.dispose();
    }

    private setLoadingState(): void {
        this.statusBarItem.text = '$(loading~spin) Loading...';
    }

    private resetRefreshState(): void {
        this.isManualRefresh = false;
        this.isRefreshing = false;
        if (this.fetchTimeoutTimer) {
            clearTimeout(this.fetchTimeoutTimer);
            this.fetchTimeoutTimer = null;
        }
    }

    private async fetchData(): Promise<void> {
        this.fetchTimeoutTimer = setTimeout(() => {
            logWithTime('[Antigravity] fetchData 超时');
            this.resetRefreshState();
            this.updateStatusBar();
        }, FETCH_TIMEOUT);

        try {
            const authStatus = await this.databaseReader.readAuthStatus();
            if (authStatus && authStatus.userStatusProtoBinaryBase64) {
                const snapshot = this.databaseReader.parseUserStatusProto(authStatus.userStatusProtoBinaryBase64);
                if (snapshot && snapshot.models.length > 0) {
                    this.quotaData = snapshot;
                } else {
                    logWithTime('[Antigravity] 本地数据库解析失败或无模型数据');
                }
            } else {
                logWithTime('[Antigravity] 本地数据库中无认证信息');
            }
        } catch (error) {
            logWithTime(`[Antigravity] fetchData 错误: ${error}`);
        } finally {
            this.resetRefreshState();
            this.updateStatusBar();
        }
    }

    private updateStatusBar(): void {
        const showAll = isShowAllProvidersEnabled();
        if (!this.quotaData) {
            if (showAll) {
                this.statusBarItem.hide();
                return;
            }
            this.statusBarItem.show();
            this.statusBarItem.text = '$(warning) $(antigravity-logo) Off';
            this.statusBarItem.tooltip = 'Antigravity 数据不可用\n点击刷新';
            return;
        }

        // Find relevant models and build display items
        const claude = this.quotaData.models.find(m => m.label.toLowerCase().includes('claude'));
        const gPro = this.quotaData.models.find(m => m.label.toLowerCase().includes('pro'));
        const gFlash = this.quotaData.models.find(m => m.label.toLowerCase().includes('flash'));

        const displayItems: { name: string; model: ModelQuotaInfo }[] = [];
        if (claude) displayItems.push({ name: 'Claude 4.5', model: claude });
        if (gPro) displayItems.push({ name: 'Gemini Pro', model: gPro });
        if (gFlash) displayItems.push({ name: 'Gemini Flash', model: gFlash });

        // Filter out models at 0% usage (100% remaining) and exclude Gemini Flash from status bar display
        const rotationItems = displayItems.filter(item =>
            item.model.remainingPercentage !== undefined &&
            item.model.remainingPercentage < 100 &&
            item.name !== 'Gemini Flash'
        );

        // Antigravity icon: $(antigravity-logo)
        const agIcon = '$(antigravity-logo)';

        if (rotationItems.length === 0) {
            if (showAll) {
                this.statusBarItem.text = `${agIcon} 0%`;
            } else {
                this.statusBarItem.text = '$(antigravity-logo) 0%';
            }
        } else {
            // Sort by timeUntilReset ascending (closest to reset first)
            rotationItems.sort((a, b) => a.model.timeUntilReset - b.model.timeUntilReset);
            const current = rotationItems[0];
            if (showAll) {
                this.statusBarItem.text = `${agIcon} ${this.formatUsage(current.model)}`;
            } else {
                this.statusBarItem.text = `$(antigravity-logo) ${current.name} ${this.formatUsage(current.model)} (${current.model.timeUntilResetFormatted})`;
            }
        }
        this.statusBarItem.tooltip = this.buildTooltip();
        this.statusBarItem.show();
    }

    private formatUsage(model: ModelQuotaInfo): string {
        const usage = model.remainingPercentage !== undefined ? 100 - model.remainingPercentage : 0;
        return model.remainingPercentage !== undefined ? `${Math.round(usage)}%` : '??%';
    }

    private buildTooltip(): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        md.supportHtml = true;

        if (!this.quotaData) {
            md.appendMarkdown('Antigravity 数据不可用\n\n[刷新](command:cursorUsage.refresh)');
            return md;
        }

        md.appendMarkdown(`**Antigravity Usage** \u00A0\u00A0 🕐${this.formatTime(this.quotaData.timestamp)}\n\n`);

        const header = '| Model | Usage | Reset |';
        const separator = '| :--- | :--- | :--- |';

        let tableRows = '';
        this.quotaData.models.forEach(model => {
            const usage = model.remainingPercentage !== undefined ? 100 - model.remainingPercentage : 0;
            const progress = this.buildProgressBar(usage);
            const shortLabel = this.shortenModelLabel(model.label);
            tableRows += `| ${shortLabel} | ${progress.bar} ${progress.percentage}% | ${model.timeUntilResetFormatted} |\n`;
        });

        md.appendMarkdown(`${header}\n${separator}\n${tableRows}\n`);
        md.appendMarkdown('---\n\n[Refresh](command:cursorUsage.refresh) \u00A0\u00A0 [Settings](command:cursorUsage.updateSession)');
        return md;
    }

    private shortenModelLabel(label: string): string {
        const mappings: Record<string, string> = {
            'Claude Sonnet 4.5': 'Sonnet 4.5',
            'Claude Sonnet 4.5 (Thinking)': 'Sonnet 4.5T',
            'Claude Opus 4.5 (Thinking)': 'Opus 4.5T',
            'Gemini 3 Flash': 'Gemini 3F',
            'Gemini 3 Pro (High)': 'Gemini 3P-H',
            'Gemini 3 Pro (Low)': 'Gemini 3P-L',
            'GPT-OSS 120B (Medium)': 'GPT-OSS',
        };
        return mappings[label] || label;
    }

    private buildProgressBar(percentage: number): { bar: string; percentage: number } {
        const length = 20;
        const filled = Math.round((percentage / 100) * length);
        const bar = '█'.repeat(filled) + '░'.repeat(length - filled);
        return { bar, percentage: Math.round(percentage) };
    }

    private formatTime(date: Date): string {
        const mm = (date.getMonth() + 1).toString().padStart(2, '0');
        const dd = date.getDate().toString().padStart(2, '0');
        const hh = date.getHours().toString().padStart(2, '0');
        const min = date.getMinutes().toString().padStart(2, '0');
        return `${mm}/${dd} ${hh}:${min}`;
    }
}
