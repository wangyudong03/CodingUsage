/**
 * CSV 导入工具
 * 将从 Cursor 官方后台导出的 CSV 数据导入到 cursor_usage_reports 表
 * 
 * 使用方法：
 *   node import-csv.js <csv文件路径> <api_key> <email> [membership_type] [api_limit] [auto_limit]
 * 
 * 示例：
 *   node import-csv.js usage-events-2025-12-08.csv ck_xxx 1459189802@qq.com pro 4500 15000
 * 
 * 说明：
 *   - Model 为 "auto" 的记录归到 auto_spend
 *   - 其他 Model 的记录归到 api_spend
 *   - Cost * 100 转换为美分存储
 *   - 每条记录保留原始时间戳，存储累计使用量
 */

const fs = require('fs');
const path = require('path');
const { run, get, all, initTables, close } = require('./db');

// 解析 CSV 行（处理引号内的逗号）
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// 解析 CSV 文件
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  
  if (lines.length < 2) {
    throw new Error('CSV 文件至少需要标题行和一行数据');
  }
  
  const headers = parseCSVLine(lines[0]);
  const records = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length !== headers.length) continue;
    
    const record = {};
    headers.forEach((h, idx) => {
      record[h] = values[idx];
    });
    records.push(record);
  }
  
  return records;
}

// 处理记录并计算累计值
function processRecords(records) {
  // 过滤有效记录并按时间正序排列
  const validRecords = records
    .filter(r => r.Kind === 'Included' && parseFloat(r.Cost) > 0)
    .map(r => ({
      timestamp: new Date(r.Date).getTime(),
      model: (r.Model || '').toLowerCase(),
      cost: Math.round(parseFloat(r.Cost) * 100) // 转换为美分
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
  
  // 计算累计值
  let totalApiSpend = 0;
  let totalAutoSpend = 0;
  
  return validRecords.map(r => {
    if (r.model === 'auto') {
      totalAutoSpend += r.cost;
    } else {
      totalApiSpend += r.cost;
    }
    
    return {
      timestamp: r.timestamp,
      api_spend: totalApiSpend,
      auto_spend: totalAutoSpend
    };
  });
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.log('使用方法:');
    console.log('  node import-csv.js <csv文件路径> <api_key> <email> [membership_type] [api_limit] [auto_limit]');
    console.log('');
    console.log('参数:');
    console.log('  csv文件路径      - Cursor 官方后台导出的 CSV 文件');
    console.log('  api_key          - API Key (如 ck_xxx)');
    console.log('  email            - 用户邮箱');
    console.log('  membership_type  - 会员类型 (默认: pro)');
    console.log('  api_limit        - API 限额美分 (默认: 4500)');
    console.log('  auto_limit       - Auto 限额美分 (默认: 15000)');
    console.log('');
    console.log('示例:');
    console.log('  node import-csv.js usage-events.csv ck_abc123 user@example.com pro 4500 15000');
    process.exit(1);
  }
  
  const [csvPath, apiKey, email, membershipType = 'pro', apiLimitStr = '4500', autoLimitStr = '15000'] = args;
  const apiLimit = parseInt(apiLimitStr, 10);
  const autoLimit = parseInt(autoLimitStr, 10);
  
  // 验证文件存在
  const fullPath = path.resolve(csvPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`错误: 文件不存在 - ${fullPath}`);
    process.exit(1);
  }
  
  console.log('='.repeat(60));
  console.log('CSV 导入工具');
  console.log('='.repeat(60));
  console.log(`文件: ${fullPath}`);
  console.log(`API Key: ${apiKey}`);
  console.log(`Email: ${email}`);
  console.log(`会员类型: ${membershipType}`);
  console.log(`API 限额: ${apiLimit} 美分 ($${(apiLimit / 100).toFixed(2)})`);
  console.log(`Auto 限额: ${autoLimit} 美分 ($${(autoLimit / 100).toFixed(2)})`);
  console.log('='.repeat(60));
  
  try {
    // 初始化数据库
    await initTables();
    
    // 解析 CSV
    console.log('\n正在解析 CSV 文件...');
    const records = parseCSV(fullPath);
    console.log(`解析到 ${records.length} 条原始记录`);
    
    // 处理记录
    const processed = processRecords(records);
    console.log(`其中 ${processed.length} 条为有效计费记录`);
    
    if (processed.length === 0) {
      console.log('没有有效记录可导入');
      return;
    }
    
    // 确保 API Key 记录存在
    let keyRecord = await get(`SELECT * FROM vibe_usage_api_keys WHERE api_key = ?`, [apiKey]);
    if (!keyRecord) {
      console.log('\n创建 API Key 记录...');
      await run(`INSERT INTO vibe_usage_api_keys (api_key, email, platform, app_name, created_at, is_public) VALUES (?, ?, ?, ?, ?, 1)`,
        [apiKey, email, 'win32', 'Cursor', Date.now()]);
    }
    
    // 计算过期时间（假设为当月最后一天）
    const now = new Date();
    const expireTime = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).getTime();
    
    // 导入数据
    console.log('\n开始导入数据...');
    let imported = 0;
    let skipped = 0;
    
    for (const item of processed) {
      // 检查是否已存在相同时间的记录
      const existing = await get(
        `SELECT id FROM cursor_usage_reports WHERE api_key = ? AND created_at = ?`,
        [apiKey, item.timestamp]
      );
      
      if (existing) {
        skipped++;
        continue;
      }
      
      await run(`INSERT INTO cursor_usage_reports (
        api_key, email, expire_time, membership_type,
        api_spend, api_limit, auto_spend, auto_limit,
        host, platform, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        apiKey,
        email,
        expireTime,
        membershipType,
        item.api_spend,
        apiLimit,
        item.auto_spend,
        autoLimit,
        'imported',
        'win32',
        item.timestamp
      ]);
      
      imported++;
    }
    
    console.log(`\n导入完成!`);
    console.log(`- 新增: ${imported} 条记录`);
    console.log(`- 跳过: ${skipped} 条 (已存在)`);
    
    // 显示汇总
    const lastItem = processed[processed.length - 1];
    const firstItem = processed[0];
    console.log('\n数据汇总:');
    console.log(`- 总 API 使用: ${lastItem.api_spend} 美分 ($${(lastItem.api_spend / 100).toFixed(2)})`);
    console.log(`- 总 Auto 使用: ${lastItem.auto_spend} 美分 ($${(lastItem.auto_spend / 100).toFixed(2)})`);
    console.log(`- 时间范围: ${new Date(firstItem.timestamp).toISOString()} ~ ${new Date(lastItem.timestamp).toISOString()}`);
    
  } catch (err) {
    console.error('导入失败:', err.message);
    process.exit(1);
  } finally {
    await close();
  }
}

main();
