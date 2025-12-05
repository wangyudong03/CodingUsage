// 数据库配置
const dotenv = require('dotenv');
const path = require('path');

// 加载环境变量
dotenv.config({
  path: path.join(__dirname, '.env')
});

// 数据库类型，默认使用sqlite
exports.DB_TYPE = process.env.DB_TYPE || 'sqlite';

// SQLite 配置
exports.SQLITE_CONFIG = {
  path: process.env.SQLITE_PATH || path.join(__dirname, 'db.sqlite')
};

// MySQL 配置
exports.MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: process.env.MYSQL_PORT || 3306,
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'cursor_usage',
  connectionLimit: 10
};
