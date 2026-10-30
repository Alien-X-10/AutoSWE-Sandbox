
import { pool } from './db.js';

// export async function createRun(problem) {
//   const result = await pool.query(
//     `INSERT INTO agent_runs (problem, status)
//      VALUES ($1, 'running')
//      RETURNING id, problem, status, started_at`,
//     [problem]
//   );

export async function createRun(problem, userId) {
  const result = await pool.query(
    `INSERT INTO agent_runs (problem, status, user_id)
     VALUES ($1, 'running', $2)
     RETURNING id, problem, status, user_id, started_at`,
    [problem, userId]
  );

  return result.rows[0];
}

//   return result.rows[0];
// }

export async function saveRunEvent(runId, event) {
  await pool.query(
    `INSERT INTO agent_events (run_id, event_type, payload)
     VALUES ($1, $2, $3::jsonb)`,
    [runId, event.type, JSON.stringify(event)]
  );
}

export async function finishRun(
  runId,
  { status, iterations, finalAnswer }
) {
  await pool.query(
    `UPDATE agent_runs
     SET status = $2,
         iterations = $3,
         final_answer = $4,
         completed_at = NOW()
     WHERE id = $1`,
    [runId, status, iterations, finalAnswer ?? null]
  );
}
