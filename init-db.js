
import fs from 'node:fs/promises';
import { pool } from './db.js';

try {
  const schema = await fs.readFile(
    new URL('./schema.sql', import.meta.url),
    'utf8'
  );

  await pool.query(schema);

  console.log('✅ Database schema created successfully!');

  const result = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('agent_runs', 'agent_events')
    ORDER BY table_name;
  `);

  console.log('Tables found:');
  for (const row of result.rows) {
    console.log(`- ${row.table_name}`);
  }
} catch (error) {
  console.error('❌ Database initialization failed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
