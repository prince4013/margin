const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('警告：找不到 DATABASE_URL 環境變數，請在 Render 上設定 PostgreSQL 連線字串。');
}

const pool = new Pool({
  connectionString,
  ssl: connectionString && connectionString.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});

module.exports = pool;
