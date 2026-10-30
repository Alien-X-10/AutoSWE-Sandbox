
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing from your .env file');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: true,
  },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export async function testDatabaseConnection() {
  const result = await pool.query(
    'SELECT NOW() AS current_time, current_database() AS database_name'
  );

  console.log('✅ PostgreSQL connected successfully!');
  console.log('Database:', result.rows[0].database_name);
  console.log('Server time:', result.rows[0].current_time);
}
