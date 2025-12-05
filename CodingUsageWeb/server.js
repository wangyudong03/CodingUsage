/**
 * Cursor Usage Web - 使用量监控平台
 * 
 * 无需登录模式：用户通过绑定客户端自动生成的 API Key 来查看使用数据
 * 
 * 支持两种运行模式：
 * 1. 独立运行（开发模式）：直接运行此文件
 *    cd tool-cursor-usage-web && npm start
 *    访问 http://localhost:3000/
 * 
 * 2. 集成运行（生产模式）：由主服务器启动并代理
 *    设置环境变量 BASE_PATH=/cursor-usage-web
 *    访问 http://localhost:3000/cursor-usage-web
 * 
 * 环境变量：
 *   - PORT          服务器端口（默认 3000）
 *   - BASE_PATH     应用基础路径（独立运行时为空，集成时为 /cursor-usage-web）
 *   - STANDALONE    是否独立运行（默认 true）
 */

const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { run, all, get, initTables, DB_TYPE } = require('./db');

// API Key 生成策略（与客户端保持一致）
const API_KEY_SALT = '123456';
function generateApiKey(appName, accountId) {
  const baseString = `${appName}-${accountId}-${API_KEY_SALT}`;
  const hash = crypto.createHash('md5').update(baseString).digest('hex');
  return `ck_${hash}`;
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;
// 独立运行模式下 BASE_PATH 为空，集成模式下由主服务器设置
const STANDALONE = process.env.STANDALONE !== 'false';
const BASE_PATH = STANDALONE ? '' : (process.env.BASE_PATH || '/cursor-usage-web');
console.log(`[cursor-usage-web] 数据库类型: ${DB_TYPE}`);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: 'vibe_usage_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 365 * 24 * 60 * 60 * 1000 } // 1年有效期
}));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use('/static/logo', express.static(path.join(__dirname, 'logo')));

// ==================== Helper Functions ====================
const helpers = {
  // 格式化过期时间
  fmtExpire(ts) {
    if (!ts || ts === 0 || ts === '0') return 'N/A';
    const d = new Date(Number(ts));
    if (isNaN(d.getTime())) return 'N/A';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${mm}-${dd} ${hh}:${mi}`;
  },

  // 格式化活动时间
  fmtActivity(ts) {
    if (!ts || ts === 0 || ts === '0') return 'Never';
    const d = new Date(Number(ts));
    if (isNaN(d.getTime())) return 'Never';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${mm}-${dd} ${hh}:${mi}`;
  },

  // 美分转美元
  dollars(cents) {
    return `$${((cents || 0) / 100).toFixed(2)}`;
  },

  // 格式化使用量（Trae 显示次数，Cursor 显示美元）
  formatUsage(value, isTrae) {
    return isTrae ? value : this.dollars(value);
  }
};

// 添加 basePath 和 helpers 到所有视图
app.use((req, res, next) => {
  res.locals.basePath = BASE_PATH;
  res.locals.helpers = helpers;
  next();
});

// 中间件：从请求中获取绑定的 API Keys（通过 cookie 传递）
app.use(async (req, res, next) => {
  try {
    // 从 cookie 获取绑定的 API Keys（前端存储在 localStorage，同步到 cookie）
    const boundKeysStr = req.cookies && req.cookies.boundApiKeys;
    const boundApiKeys = boundKeysStr ? JSON.parse(decodeURIComponent(boundKeysStr)) : [];
    res.locals.hasBoundKeys = boundApiKeys.length > 0;
    res.locals.boundApiKeys = boundApiKeys;
    res.locals.boundApiKeysCount = boundApiKeys.length;
  } catch {
    res.locals.hasBoundKeys = false;
    res.locals.boundApiKeys = [];
    res.locals.boundApiKeysCount = 0;
  }
  next();
});

async function init() {
  // 初始化数据库表
  await initTables();

  // 加载 mock.sql 测试数据
  const mockSqlPath = path.join(__dirname, 'mock.sql');
  if (fs.existsSync(mockSqlPath)) {
    try {
      const mockSql = fs.readFileSync(mockSqlPath, 'utf-8');
      // 按分号分割 SQL 语句并逐条执行
      const statements = mockSql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && s.toUpperCase().startsWith('INSERT'));

      for (const stmt of statements) {
        try {
          let safeStmt = stmt;
          if (DB_TYPE === 'mysql') {
            // MySQL 使用 INSERT IGNORE
            safeStmt = stmt.replace(/^INSERT INTO/i, 'INSERT IGNORE INTO');
          } else {
            // SQLite 使用 INSERT OR IGNORE
            safeStmt = stmt.replace(/^INSERT INTO/i, 'INSERT OR IGNORE INTO');
          }
          await run(safeStmt);
        } catch (e) {
          // 忽略单条语句的错误（如重复数据）
          console.log(`[mock.sql] Skip: ${e.message}`);
        }
      }
      console.log(`[cursor-usage-web] 已加载 mock.sql 测试数据`);
    } catch (e) {
      console.log(`[cursor-usage-web] 加载 mock.sql 失败: ${e.message}`);
    }
  }
}

// 根据 API Key 获取或创建记录，并更新 email 和 app_name
async function getOrCreateApiKeyRecord(apiKey, email, platform, appName) {
  let record = await get(`SELECT * FROM vibe_usage_api_keys WHERE api_key = ?`, [apiKey]);
  if (!record) {
    // 默认设置 is_public 为 1（公开）
    await run(`INSERT INTO vibe_usage_api_keys (api_key, email, platform, app_name, created_at, is_public) VALUES (?, ?, ?, ?, ?, 1)`,
      [apiKey, email || '', platform || '', appName || '', Date.now()]);
    record = await get(`SELECT * FROM vibe_usage_api_keys WHERE api_key = ?`, [apiKey]);
  } else {
    // 更新 email 和 app_name（如果有变化）
    const updates = [];
    const params = [];
    if (email && email !== record.email) {
      updates.push('email = ?');
      params.push(email);
    }
    if (appName && appName !== record.app_name) {
      updates.push('app_name = ?');
      params.push(appName);
    }
    if (updates.length > 0) {
      params.push(apiKey);
      await run(`UPDATE vibe_usage_api_keys SET ${updates.join(', ')} WHERE api_key = ?`, params);
    }
  }
  return record;
}

// 根据 app_name 获取 logo 路径
function getAppLogo(appName) {
  if (!appName) return null;
  const name = appName.toLowerCase();
  if (name.includes('cursor')) return '/static/logo/cursor.png';
  if (name.includes('trae')) return '/static/logo/trae.png';
  return null;
}

// 判断是否为 Trae（使用次数而非美元）
function isTrae(appName) {
  if (!appName) return false;
  return appName.toLowerCase().includes('trae');
}

// ==================== 页面路由 ====================

// 根据 app_name 获取对应的使用数据表
function getUsageTable(appName) {
  return isTrae(appName) ? 'trae_usage_reports' : 'cursor_usage_reports';
}

// 个人统计页面 - 作为主页
app.get('/', async (req, res) => {
  // 从 cookie 获取绑定的 API Keys
  let boundApiKeys = [];
  try {
    const boundKeysStr = req.cookies && req.cookies.boundApiKeys;
    boundApiKeys = boundKeysStr ? JSON.parse(decodeURIComponent(boundKeysStr)) : [];
  } catch {
    boundApiKeys = [];
  }

  if (boundApiKeys.length === 0) {
    return res.render('me', {
      hasBoundKeys: false,
      keys: [],
      host: req.get('host'),
      basePath: BASE_PATH
    });
  }

  // 获取所有绑定的 API Keys 的信息（包括数据库中不存在的）
  const placeholders = boundApiKeys.map(() => '?').join(',');
  const keysRaw = await all(`SELECT * FROM vibe_usage_api_keys WHERE api_key IN (${placeholders})`, boundApiKeys);

  // 创建一个 map 方便查找
  const keysMap = new Map();
  for (const k of keysRaw) {
    keysMap.set(k.api_key, k);
  }

  // 补充 email 并为每个 key 获取独立的使用统计和趋势
  const keys = [];
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
  const startTs = start.getTime();

  // 遍历所有缓存的 API Keys，而不仅仅是数据库中存在的
  for (const apiKey of boundApiKeys) {
    const k = keysMap.get(apiKey);

    if (!k) {
      // 数据库中不存在此 API Key，返回一个占位对象以便前端显示解绑按钮
      keys.push({
        api_key: apiKey,
        api_key_short: apiKey.substring(0, 8) + '...',
        email: '',
        app_name: '',
        app_logo: null,
        is_trae: false,
        is_cursor: false,
        online: false,
        is_public: false,
        created_at: null,
        usage: null,
        trend: [],
        maxVal: 0,
        notFound: true  // 标记为数据库中不存在
      });
      continue;
    }

    const isTraeApp = isTrae(k.app_name);
    const usageTable = getUsageTable(k.app_name);

    let email = k.email;
    if (!email) {
      const latest = await get(`SELECT email FROM ${usageTable} WHERE api_key = ? AND email IS NOT NULL ORDER BY created_at DESC LIMIT 1`, [k.api_key]);
      email = latest ? latest.email : '';
    }

    // 获取此 key 的最新使用数据
    const latestReport = await get(`SELECT * FROM ${usageTable} WHERE api_key = ? ORDER BY created_at DESC LIMIT 1`, [k.api_key]);

    // 对于 Cursor，趋势数据基于 api_spend；对于 Trae，基于 used_usage
    const trendField = isTraeApp ? 'used_usage' : 'api_spend';
    const reports = await all(`SELECT created_at, ${trendField} as trend_value FROM ${usageTable} WHERE api_key = ? ORDER BY created_at ASC`, [k.api_key]);
    const byDay = new Map();
    for (const r of reports) {
      const d = new Date(r.created_at);
      const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      // 取当天最后一次记录的值
      byDay.set(dayKey, r.trend_value || 0);
    }

    const prevRow = await get(`SELECT ${trendField} as trend_value FROM ${usageTable} WHERE api_key = ? AND created_at < ? ORDER BY created_at DESC LIMIT 1`, [k.api_key, startTs]);
    let lastKnown = prevRow ? prevRow.trend_value || 0 : 0;

    const trend = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (byDay.has(key)) {
        lastKnown = byDay.get(key);
      }
      const label = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      trend.push({ label, value: lastKnown });
    }
    const maxVal = trend.reduce((m, p) => Math.max(m, p.value || 0), 0);

    // 构建使用数据对象
    let usageData = null;
    if (latestReport) {
      if (isTraeApp) {
        // Trae 使用数据
        usageData = {
          membership_type: latestReport.membership_type,
          expire_time: latestReport.expire_time,
          total_usage: latestReport.total_usage,
          used_usage: latestReport.used_usage
        };
      } else {
        // Cursor 使用数据
        usageData = {
          membership_type: latestReport.membership_type,
          expire_time: latestReport.expire_time,
          api_spend: latestReport.api_spend || 0,
          api_limit: latestReport.api_limit || 0,
          auto_spend: latestReport.auto_spend || 0,
          auto_limit: latestReport.auto_limit || 0
        };
      }
    }

    keys.push({
      ...k,
      email: email,
      app_logo: getAppLogo(k.app_name),
      is_trae: isTraeApp,
      is_cursor: !isTraeApp,
      api_key_short: k.api_key.substring(0, 8) + '...',
      notFound: false,
      usage: usageData,
      trend: trend,
      maxVal: maxVal
    });
  }

  res.render('me', {
    hasBoundKeys: true,
    keys,
    host: req.get('host'),
    basePath: BASE_PATH
  });
});

// 广场页面 - 显示公开的使用数据（按 email 账号维度聚合展示）
app.get('/plaza', async (req, res) => {
  const sortBy = req.query.sortBy || 'activity';
  const order = req.query.order || 'desc';

  // 获取所有公开的 API Keys 及其最新使用数据，按 email 账号维度聚合
  const apiKeys = await all(`SELECT * FROM vibe_usage_api_keys WHERE is_public = 1`);

  // 按 email 分组
  const emailGroups = new Map();

  for (const k of apiKeys) {
    const isTraeApp = isTrae(k.app_name);
    const usageTable = getUsageTable(k.app_name);
    const r = await get(`SELECT * FROM ${usageTable} WHERE api_key = ? ORDER BY created_at DESC LIMIT 1`, [k.api_key]);
    // 获取 email，优先从 API Key 记录获取，其次从使用报告获取
    const email = k.email || (r ? r.email : '') || '';

      if (!email) {
      // 没有 email 的记录单独显示（使用 api_key 作为分组键）
      const groupKey = `__apikey__${k.api_key}`;
      const groupData = {
        email: 'Unknown',
        api_keys: [k.api_key],
        app_name: k.app_name || '',
        online: !!k.online,
        membership_type: r ? r.membership_type : '',
        expire_time: r ? r.expire_time : null,
        last_activity: r ? r.created_at : 0,
        is_trae: isTraeApp,
        is_cursor: !isTraeApp
      };
      // 根据不同应用添加对应字段
      if (isTraeApp) {
        groupData.total_usage = r ? r.total_usage : 0;
        groupData.used_usage = r ? r.used_usage : 0;
      } else {
        groupData.api_spend = r ? (r.api_spend || 0) : 0;
        groupData.api_limit = r ? (r.api_limit || 0) : 0;
        groupData.auto_spend = r ? (r.auto_spend || 0) : 0;
        groupData.auto_limit = r ? (r.auto_limit || 0) : 0;
      }
      emailGroups.set(groupKey, groupData);
    } else {
      // 按 email 聚合
      if (!emailGroups.has(email)) {
        const groupData = {
          email: email,
          api_keys: [],
          app_name: '',
          online: false,
          membership_type: '',
          expire_time: null,
          last_activity: 0,
          is_trae: false,
          is_cursor: false
        };
        emailGroups.set(email, groupData);
      }

      const group = emailGroups.get(email);
      group.api_keys.push(k.api_key);

      // 合并在线状态（任一设备在线则显示在线）
      if (k.online) group.online = true;

      // 使用最新的使用报告数据
      if (r && r.created_at > group.last_activity) {
        group.membership_type = r.membership_type || group.membership_type;
        group.expire_time = r.expire_time || group.expire_time;
        group.last_activity = r.created_at;
        
        // 根据不同应用添加对应字段
        if (isTraeApp) {
          group.total_usage = r.total_usage || 0;
          group.used_usage = r.used_usage || 0;
        } else {
          group.api_spend = r.api_spend || 0;
          group.api_limit = r.api_limit || 0;
          group.auto_spend = r.auto_spend || 0;
          group.auto_limit = r.auto_limit || 0;
        }
      }

      // 更新 app_name（优先显示有值的）
      if (k.app_name && !group.app_name) {
        group.app_name = k.app_name;
        group.is_trae = isTraeApp;
        group.is_cursor = !isTraeApp;
      }
    }
  }

  // 转换为卡片数组
  const cards = [];
  for (const [key, group] of emailGroups) {
    const card = {
      email: group.email,
      api_key_short: group.api_keys.length > 1
        ? `${group.api_keys.length} devices`
        : group.api_keys[0].substring(0, 8) + '...',
      app_name: group.app_name,
      app_logo: getAppLogo(group.app_name),
      is_trae: group.is_trae,
      is_cursor: group.is_cursor,
      online: group.online,
      membership_type: group.membership_type,
      expire_time: group.expire_time,
      last_activity: group.last_activity,
      device_count: group.api_keys.length
    };
    // 根据不同应用添加对应字段
    if (group.is_trae) {
      card.total_usage = group.total_usage || 0;
      card.used_usage = group.used_usage || 0;
    } else {
      card.api_spend = group.api_spend || 0;
      card.api_limit = group.api_limit || 0;
      card.auto_spend = group.auto_spend || 0;
      card.auto_limit = group.auto_limit || 0;
    }
    cards.push(card);
  }

  // 排序
  cards.sort((a, b) => {
    let valA, valB;
    if (sortBy === 'usage') {
      // 对于 Cursor 使用 api_spend 排序，对于 Trae 使用 used_usage
      valA = a.is_cursor ? (a.api_spend || 0) : (a.used_usage || 0);
      valB = b.is_cursor ? (b.api_spend || 0) : (b.used_usage || 0);
    } else {
      valA = a.last_activity || 0;
      valB = b.last_activity || 0;
    }
    return order === 'asc' ? valA - valB : valB - valA;
  });

  res.render('plaza', { cards, sortBy, order });
});

// 兼容旧的 /me 路由，重定向到主页
app.get('/me', (req, res) => {
  res.redirect(BASE_PATH + '/');
});

// 验证 API Key（检查是否存在）
app.post('/validate-key', async (req, res) => {
  const { api_key } = req.body;

  // API Key 格式: ck_ + 32位 md5 = 35位
  if (!api_key || !api_key.startsWith('ck_') || api_key.length !== 35) {
    return res.status(400).json({ error: 'Invalid API Key format. Must start with "ck_" and be 35 characters.' });
  }

  // 检查 API Key 是否存在
  const keyRecord = await get(`SELECT * FROM vibe_usage_api_keys WHERE api_key = ?`, [api_key]);
  if (!keyRecord) {
    return res.status(404).json({ error: 'API Key not found. Please make sure the extension has reported data first.' });
  }

  res.json({ ok: true, message: 'API Key is valid' });
});

// 切换公开状态
app.post('/toggle-public', async (req, res) => {
  const { api_key, bound_keys } = req.body;
  const boundApiKeys = bound_keys || [];

  if (!boundApiKeys.includes(api_key)) {
    return res.status(403).json({ error: 'You can only modify your bound API Keys' });
  }

  const current = await get(`SELECT is_public FROM vibe_usage_api_keys WHERE api_key = ?`, [api_key]);
  if (!current) {
    return res.status(404).json({ error: 'API Key not found' });
  }

  const newValue = current.is_public ? 0 : 1;
  await run(`UPDATE vibe_usage_api_keys SET is_public = ? WHERE api_key = ?`, [newValue, api_key]);

  res.json({ ok: true, is_public: newValue === 1 });
});

// ==================== API 路由 ====================

// 通用提交使用数据函数
async function submitUsageData(req, res, isTrae) {
  const b = req.body;
  const apiKey = b.client_token || req.header('X-Api-Key');
  if (!apiKey) return res.status(401).json({ error: 'client_token required' });

  // 验证 API Key
  if (!b.email || !b.app_name) {
    return res.status(400).json({ error: 'email and app_name required for API key validation' });
  }
  const expectedApiKey = generateApiKey(b.app_name, b.email);
  if (apiKey !== expectedApiKey) {
    return res.status(403).json({ error: 'Invalid API key' });
  }

  // 确保 API Key 记录存在
  await getOrCreateApiKeyRecord(apiKey, b.email, b.platform, b.app_name);

  if (isTrae) {
    // Trae 使用数据
    await run(`INSERT INTO trae_usage_reports (
      api_key, email, expire_time, membership_type, 
      total_usage, used_usage,
      host, platform, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      apiKey, b.email || null, b.expire_time || null, b.membership_type || '',
      b.total_usage || 0, b.used_usage || 0,
      b.host || '', b.platform || '', Date.now()
    ]);
  } else {
    // Cursor 使用数据
    await run(`INSERT INTO cursor_usage_reports (
      api_key, email, expire_time, membership_type, 
      api_spend, api_limit, auto_spend, auto_limit,
      host, platform, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      apiKey, b.email || null, b.expire_time || null, b.membership_type || '',
      b.api_spend || 0, b.api_limit || 0, b.auto_spend || 0, b.auto_limit || 0,
      b.host || '', b.platform || '', Date.now()
    ]);
  }
  res.json({ ok: true });
}

// 提交 Cursor 使用数据
app.post('/api/cursor-usage', async (req, res) => {
  await submitUsageData(req, res, false);
});

// 提交 Trae 使用数据
app.post('/api/trae-usage', async (req, res) => {
  await submitUsageData(req, res, true);
});

// Ping - 更新在线状态
app.post('/api/ping', async (req, res) => {
  const b = req.body || {};
  // 优先从请求体获取 client_token，兼容从 header 获取
  const apiKey = b.client_token || req.header('X-Api-Key');
  if (!apiKey) return res.status(401).json({ error: 'client_token required' });

  const active = typeof b.active !== 'undefined' ? !!b.active : true;

  // 确保记录存在
  await getOrCreateApiKeyRecord(apiKey, null, null);

  await run(`UPDATE vibe_usage_api_keys SET last_ping_at = ?, online = ? WHERE api_key = ?`, [Date.now(), active ? 1 : 0, apiKey]);
  res.json({ ok: true });
});

// 定期更新离线状态
setInterval(async () => {
  const threshold = Date.now() - 120000;
  await run(`UPDATE vibe_usage_api_keys SET online = 0 WHERE last_ping_at IS NULL OR last_ping_at < ?`, [threshold]);
}, 120000);

// 健康检查 API - 用于识别这是一个 Coding Usage 服务
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'coding-usage',
    version: '1.0.0',
    timestamp: Date.now()
  });
});

// 获取使用趋势数据（支持不同时间粒度）
app.get('/api/trend/:apiKey', async (req, res) => {
  const { apiKey } = req.params;
  const granularity = req.query.granularity || 'day'; // day, hour, minute

  // 验证 API Key 是否存在
  const keyRecord = await get(`SELECT * FROM vibe_usage_api_keys WHERE api_key = ?`, [apiKey]);
  if (!keyRecord) {
    return res.status(404).json({ error: 'API Key not found' });
  }

  const isTraeApp = isTrae(keyRecord.app_name);
  const usageTable = getUsageTable(keyRecord.app_name);
  const trendField = isTraeApp ? 'used_usage' : 'api_spend';

  const now = new Date();
  let startDate, periodCount, formatKey, formatLabel;

  if (granularity === 'minute') {
    // 分钟级：最近1天（24小时 * 60分钟 = 1440个数据点，但我们取最近 24*60 = 1440 分钟）
    // 为了性能考虑，取最近24小时，每分钟一个点
    startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    periodCount = 24 * 60; // 1440 分钟
    formatKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    formatLabel = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } else if (granularity === 'hour') {
    // 小时级：最近7天
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0);
    periodCount = 7 * 24; // 168 小时
    formatKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}`;
    formatLabel = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:00`;
  } else {
    // 天级：最近30天（默认）
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
    periodCount = 30;
    formatKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    formatLabel = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const startTs = startDate.getTime();

  // 获取时间范围内的所有数据
  const reports = await all(
    `SELECT created_at, ${trendField} as trend_value FROM ${usageTable} WHERE api_key = ? ORDER BY created_at ASC`,
    [apiKey]
  );

  // 按周期聚合，取每个周期最后一条记录
  const byPeriod = new Map();
  for (const r of reports) {
    const d = new Date(r.created_at);
    const periodKey = formatKey(d);
    // 始终取最后一条记录（覆盖之前的）
    byPeriod.set(periodKey, r.trend_value || 0);
  }

  // 获取起始时间之前的最后一条记录作为初始值
  const prevRow = await get(
    `SELECT ${trendField} as trend_value FROM ${usageTable} WHERE api_key = ? AND created_at < ? ORDER BY created_at DESC LIMIT 1`,
    [apiKey, startTs]
  );
  let lastKnown = prevRow ? prevRow.trend_value || 0 : 0;

  // 生成趋势数据
  const trend = [];
  for (let i = 0; i < periodCount; i++) {
    let d;
    if (granularity === 'minute') {
      d = new Date(startDate.getTime() + i * 60 * 1000);
    } else if (granularity === 'hour') {
      d = new Date(startDate.getTime() + i * 60 * 60 * 1000);
    } else {
      d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
    }
    
    const key = formatKey(d);
    if (byPeriod.has(key)) {
      lastKnown = byPeriod.get(key);
    }
    
    trend.push({
      label: formatLabel(d),
      value: lastKnown,
      key: key
    });
  }

  const maxVal = trend.reduce((m, p) => Math.max(m, p.value || 0), 0);

  res.json({
    trend,
    maxVal,
    granularity,
    is_trae: isTraeApp,
    is_cursor: !isTraeApp
  });
});

// 导出配置（用于客户端导入）
app.get('/api/config', (req, res) => {
  const protocol = req.protocol;
  const host = req.get('host');
  res.json({
    host: `${protocol}://${host}`
  });
});

// 初始化
app.get('/api/init', async (req, res) => {
  try {
    await init();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

init().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[cursor-usage-web] ========================================`);
    console.log(`[cursor-usage-web] Cursor Usage Web 已启动`);
    console.log(`[cursor-usage-web] ========================================`);
    console.log(`[cursor-usage-web] 运行模式: ${STANDALONE ? '独立开发模式' : '集成模式'}`);
    console.log(`[cursor-usage-web] 端口: ${PORT}`);
    console.log(`[cursor-usage-web] 绑定地址: 0.0.0.0 (所有网络接口)`);
    console.log(`[cursor-usage-web] 本地访问: http://localhost:${PORT}${BASE_PATH || '/'}`);
    console.log(`[cursor-usage-web] 外部访问: http://[你的IP地址]:${PORT}${BASE_PATH || '/'}`);
    console.log(`[cursor-usage-web] ========================================`);
  });
});
