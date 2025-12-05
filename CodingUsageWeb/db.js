// 数据库连接管理模块
const sqlite3 = require('sqlite3').verbose();
const mysql = require('mysql2/promise');
const { DB_TYPE, SQLITE_CONFIG, MYSQL_CONFIG } = require('./db_config');

// 数据库连接实例
let db = null;

// 数据库适配器模式
const dbAdapters = {
  mysql: {
    async createConnection() {
      const pool = mysql.createPool(MYSQL_CONFIG);
      try {
        const connection = await pool.getConnection();
        connection.release();
        console.log(`[database] MySQL 连接池已创建`);
      } catch (error) {
        console.error(`[database] MySQL 连接失败:`, error);
        throw error;
      }
      return pool;
    },
    
    async run(connection, sql, params) {
      const [result] = await connection.execute(sql, params);
      return result;
    },
    
    async all(connection, sql, params) {
      const [rows] = await connection.execute(sql, params);
      return rows;
    },
    
    async get(connection, sql, params) {
      const [rows] = await connection.execute(sql, params);
      return rows[0] || null;
    },
    
    async close(connection) {
      await connection.end();
      console.log(`[database] MySQL 连接池已关闭`);
    },
    
    async createIndex(connection, table, name, columns) {
      const [rows] = await connection.execute(
        `SELECT COUNT(*) as count 
         FROM information_schema.statistics 
         WHERE table_schema = DATABASE() 
         AND table_name = ? 
         AND index_name = ?`,
        [table, name]
      );
      
      if (rows[0].count === 0) {
        await connection.execute(`CREATE INDEX ${name} ON ${table}(${columns})`);
      }
    }
  },
  
  sqlite: {
    async createConnection() {
      return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(SQLITE_CONFIG.path, (err) => {
          if (err) {
            console.error(`[database] SQLite 连接失败:`, err);
            reject(err);
          } else {
            console.log(`[database] SQLite 连接已创建: ${SQLITE_CONFIG.path}`);
            resolve(db);
          }
        });
      });
    },
    
    async run(connection, sql, params) {
      return new Promise((resolve, reject) => {
        connection.run(sql, params, function (err) {
          if (err) reject(err);
          else resolve(this);
        });
      });
    },
    
    async all(connection, sql, params) {
      return new Promise((resolve, reject) => {
        connection.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    },
    
    async get(connection, sql, params) {
      return new Promise((resolve, reject) => {
        connection.get(sql, params, (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    },
    
    async close(connection) {
      return new Promise((resolve, reject) => {
        connection.close((err) => {
          if (err) {
            console.error(`[database] SQLite 连接关闭失败:`, err);
            reject(err);
          } else {
            console.log(`[database] SQLite 连接已关闭`);
            resolve();
          }
        });
      });
    },
    
    async createIndex(connection, table, name, columns) {
      return new Promise((resolve, reject) => {
        connection.run(
          `CREATE INDEX IF NOT EXISTS ${name} ON ${table}(${columns})`,
          (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });
    }
  }
};

// 获取当前数据库适配器
const currentAdapter = dbAdapters[DB_TYPE];

// 获取数据库连接
async function getConnection() {
  if (!db) {
    db = await currentAdapter.createConnection();
  }
  return db;
}

// 数据库操作方法封装
async function run(sql, params = []) {
  const connection = await getConnection();
  return currentAdapter.run(connection, sql, params);
}

async function all(sql, params = []) {
  const connection = await getConnection();
  return currentAdapter.all(connection, sql, params);
}

async function get(sql, params = []) {
  const connection = await getConnection();
  return currentAdapter.get(connection, sql, params);
}

// 关闭数据库连接
async function close() {
  if (db) {
    await currentAdapter.close(db);
    db = null;
  }
}

// 列类型映射
const columnTypeMap = {
  // SQLite -> MySQL 的类型映射
  'INTEGER PRIMARY KEY AUTOINCREMENT': 'INT AUTO_INCREMENT PRIMARY KEY',
  'BIGINT': 'BIGINT',
  'VARCHAR': 'VARCHAR',
  'TINYINT': 'TINYINT'
};

// 统一的表结构定义（使用 SQLite 语法作为基准）
const tableSchemas = {
  vibe_usage_api_keys: {
    columns: [
      'id INTEGER PRIMARY KEY AUTOINCREMENT',
      'api_key VARCHAR(64) UNIQUE NOT NULL',
      'email VARCHAR(255)',
      'platform VARCHAR(64)',
      'app_name VARCHAR(64)',
      'created_at BIGINT NOT NULL',
      'last_ping_at BIGINT DEFAULT NULL',
      'online TINYINT DEFAULT 0',
      'is_public TINYINT DEFAULT 0'
    ]
  },
  
  cursor_usage_reports: {
    columns: [
      'id INTEGER PRIMARY KEY AUTOINCREMENT',
      'api_key VARCHAR(64) NOT NULL',
      'email VARCHAR(255)',
      'expire_time BIGINT',
      'membership_type VARCHAR(32)',
      'api_spend BIGINT DEFAULT 0',
      'api_limit BIGINT DEFAULT 0',
      'auto_spend BIGINT DEFAULT 0',
      'auto_limit BIGINT DEFAULT 0',
      'host VARCHAR(255)',
      'platform VARCHAR(64)',
      'created_at BIGINT NOT NULL'
    ],
    foreignKeys: [
      'FOREIGN KEY(api_key) REFERENCES vibe_usage_api_keys(api_key)'
    ]
  },
  
  trae_usage_reports: {
    columns: [
      'id INTEGER PRIMARY KEY AUTOINCREMENT',
      'api_key VARCHAR(64) NOT NULL',
      'email VARCHAR(255)',
      'expire_time BIGINT',
      'membership_type VARCHAR(32)',
      'total_usage BIGINT',
      'used_usage BIGINT',
      'host VARCHAR(255)',
      'platform VARCHAR(64)',
      'created_at BIGINT NOT NULL'
    ],
    foreignKeys: [
      'FOREIGN KEY(api_key) REFERENCES vibe_usage_api_keys(api_key)'
    ]
  }
};

// 将列定义转换为对应数据库的语法
function convertColumnType(column, targetDB) {
  if (targetDB === 'sqlite') {
    return column;
  }
  
  // MySQL 转换
  let converted = column;
  
  // 转换主键自增
  if (column.includes('INTEGER PRIMARY KEY AUTOINCREMENT')) {
    converted = column.replace('INTEGER PRIMARY KEY AUTOINCREMENT', 'INT AUTO_INCREMENT');
  }
  
  return converted;
}

// 生成 CREATE TABLE 语句
function generateCreateTableSQL(tableName, schema, dbType) {
  const columns = schema.columns.map(col => convertColumnType(col, dbType));
  
  let sql = `CREATE TABLE IF NOT EXISTS ${tableName} (\n  ${columns.join(',\n  ')}`;
  
  // MySQL 需要单独的 PRIMARY KEY 声明（如果没有在列定义中）
  if (dbType === 'mysql') {
    const hasPrimaryKey = columns.some(col => 
      col.includes('PRIMARY KEY') || col.includes('AUTO_INCREMENT')
    );
    
    if (!hasPrimaryKey) {
      sql += ',\n  PRIMARY KEY (id)';
    } else {
      // 移除列定义中的 PRIMARY KEY，添加到末尾
      const cleanedColumns = columns.map(col => 
        col.replace('PRIMARY KEY', '').trim()
      );
      sql = `CREATE TABLE IF NOT EXISTS ${tableName} (\n  ${cleanedColumns.join(',\n  ')}`;
      sql += ',\n  PRIMARY KEY (id)';
    }
  }
  
  // 添加外键约束
  if (schema.foreignKeys && schema.foreignKeys.length > 0) {
    sql += ',\n  ' + schema.foreignKeys.join(',\n  ');
  }
  
  sql += '\n)';
  
  return sql;
}

// 生成所有表的定义
const tableDefinitions = {};
Object.keys(tableSchemas).forEach(tableName => {
  tableDefinitions[tableName] = {
    mysql: generateCreateTableSQL(tableName, tableSchemas[tableName], 'mysql'),
    sqlite: generateCreateTableSQL(tableName, tableSchemas[tableName], 'sqlite')
  };
});

// 索引定义配置
const indexDefinitions = [
  { table: 'cursor_usage_reports', name: 'idx_cursor_usage_api_key', columns: 'api_key' },
  { table: 'cursor_usage_reports', name: 'idx_cursor_usage_created_at', columns: 'created_at' },
  { table: 'trae_usage_reports', name: 'idx_trae_usage_api_key', columns: 'api_key' },
  { table: 'trae_usage_reports', name: 'idx_trae_usage_created_at', columns: 'created_at' }
];

// 检查并创建表（兼容不同数据库）
async function initTables() {
  const connection = await getConnection();
  
  // 创建表
  for (const [tableName, definitions] of Object.entries(tableDefinitions)) {
    try {
      await run(definitions[DB_TYPE]);
      console.log(`[database] 表 ${tableName} 创建/检查完成`);
    } catch (e) {
      console.error(`[database] 表 ${tableName} 创建失败:`, e.message);
      throw e;
    }
  }
  
  // 创建索引
  for (const { table, name, columns } of indexDefinitions) {
    try {
      await currentAdapter.createIndex(connection, table, name, columns);
    } catch (e) {
      console.warn(`[database] 索引 ${name} 创建失败:`, e.message);
    }
  }
  
  console.log(`[database] 数据库初始化完成`);
}

module.exports = {
  getConnection,
  run,
  all,
  get,
  close,
  initTables,
  DB_TYPE
};
