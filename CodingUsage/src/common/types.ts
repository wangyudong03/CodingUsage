export type AppType = 'cursor' | 'trae' | 'antigravity' | 'unknown';

export interface IUsageProvider {
    initialize(): void;
    refresh(): void;
    handleStatusBarClick(): void;
    showOutput(): void;
    dispose(): void;
    isInRefreshingState(): boolean;
    safeRefresh(): void;
    isAuthenticated(): boolean;
}

























