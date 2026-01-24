export const APP_NAME = 'Coding Usage';
export const DOUBLE_CLICK_DELAY = 300;
export const MAX_RETRY_COUNT = 3;
export const RETRY_DELAY = 1000;
export const FETCH_TIMEOUT = 30000;
export const API_TIMEOUT = 5000;

// Trae 只保留默认 host，仅在 storage.json 不可用时作为回退
export const TRAE_DEFAULT_HOST = 'https://api-sg-central.trae.ai';

export const CURSOR_API_BASE_URL = 'https://cursor.com/api';

// PromptCache Timer Constants
export const PROMPT_CACHE_DURATION_MS = 5 * 60 * 1000; // 5分钟 = 300000毫秒
export const PROMPT_CACHE_UPDATE_INTERVAL_MS = 1000; // 每秒更新显示

// Database Monitor Constants
export const DB_MONITOR_BACKUP_INTERVAL_MS = 30000; // 备份轮询间隔，30秒（主要依赖文件系统监控）
export const DB_WATCHER_DEBOUNCE_MS = 500; // 文件变化事件防抖间隔























