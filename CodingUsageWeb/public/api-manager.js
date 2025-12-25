/**
 * API Key 存储管理模块
 * 负责管理绑定的 API Keys（存储在 localStorage 和 cookie）
 */

const API_KEYS_STORAGE_KEY = 'boundApiKeys';

/**
 * 获取所有绑定的 API Keys
 * @returns {string[]} API Keys 数组
 */
function getBoundApiKeys() {
  try {
    const keys = localStorage.getItem(API_KEYS_STORAGE_KEY);
    return keys ? JSON.parse(keys) : [];
  } catch {
    return [];
  }
}

/**
 * 保存绑定的 API Keys 到 localStorage 和 cookie
 * @param {string[]} keys - API Keys 数组
 */
function saveBoundApiKeys(keys) {
  localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(keys));
  // 同步到 cookie 以便服务端读取
  document.cookie = `boundApiKeys=${encodeURIComponent(JSON.stringify(keys))};path=/;max-age=${365 * 24 * 60 * 60}`;
}

/**
 * 添加一个新的 API Key
 * @param {string} apiKey - API Key
 */
function addBoundApiKey(apiKey) {
  const keys = getBoundApiKeys();
  if (!keys.includes(apiKey)) {
    keys.push(apiKey);
    saveBoundApiKeys(keys);
  }
}

/**
 * 移除一个 API Key
 * @param {string} apiKey - API Key
 */
function removeBoundApiKey(apiKey) {
  const keys = getBoundApiKeys().filter(k => k !== apiKey);
  saveBoundApiKeys(keys);
}

// 页面加载时同步 localStorage 到 cookie
saveBoundApiKeys(getBoundApiKeys());



