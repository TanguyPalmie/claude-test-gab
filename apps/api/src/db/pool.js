import pg from 'pg';

const { Pool } = pg;

let pool;

export function getPool() {
  if (!pool) {
    throw new Error('Database pool not initialized. Call initDb() first.');
  }
  return pool;
}

export async function initDb() {
  pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'topten',
    user: process.env.POSTGRES_USER || 'topten',
    password: process.env.POSTGRES_PASSWORD || 'topten',
    max: 20,
    idleTimeoutMillis: 30_000,
  });

  // Verify connection
  const client = await pool.connect();
  await client.query('SELECT 1');
  client.release();
}

export async function query(text, params) {
  return getPool().query(text, params);
}
