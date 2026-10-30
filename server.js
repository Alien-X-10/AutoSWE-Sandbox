import express from 'express';
import cors from 'cors';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import dotenv from 'dotenv';
import { runAgentLoop } from './agent.js';
import {
  createRun,
  saveRunEvent,
  finishRun,
} from './runStore.js';
import { pool } from './db.js';

import authRouter from './auth.js';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const PgSession = connectPgSimple(session);

const sessionStore = new PgSession({
  pool,
  tableName: 'user_sessions',
  createTableIfMissing: true,
  pruneSessionInterval: 15 * 60,
});

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '2mb' }));

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24,
  },
}));

app.use('/api/auth', authRouter);

app.get('/api/agent/runs', async (req, res) => {
  // Verify authentication
  if (!req.session?.userId) {
    return res.status(401).json({
      error: 'You must be logged in to view agent runs.',
    });
  }
  try {
    const result = await pool.query(
      `SELECT
         id,
         problem,
         status,
         iterations,
         final_answer,
         started_at,
         completed_at
       FROM agent_runs
       WHERE user_id = $1
       ORDER BY started_at DESC
       LIMIT 50`,
      [req.session.userId]
    );

    return res.json({ runs: result.rows });

  } catch (error) {
    console.error(
      '[Database] Failed to fetch agent runs:',
      error.message
    );

    return res.status(500).json({
      error: 'Failed to fetch agent runs.',
    });
  }
});


// Get execution events for a specific run
app.get('/api/agent/runs/:id/events', async (req, res) => {

  // 1. Verify authentication
  if (!req.session?.userId) {
    return res.status(401).json({
      error: 'You must be logged in to view agent events.',
    });
  }

  // 2. Validate run ID
  const runId = req.params.id;

  if (!/^\d+$/.test(runId)) {
    return res.status(400).json({
      error: 'Invalid run ID.',
    });
  }

  try {
    // 3. Verify that this run belongs to the logged-in user
    const runResult = await pool.query(
      `SELECT id
       FROM agent_runs
       WHERE id = $1 AND user_id = $2`,
      [runId, req.session.userId]
    );

    if (runResult.rowCount === 0) {
      return res.status(404).json({
        error: 'Agent run not found.',
      });
    }

    // 4. Fetch saved events for this run
    const eventsResult = await pool.query(
      `SELECT id, event_type, payload, created_at
       FROM agent_events
       WHERE run_id = $1
       ORDER BY id ASC`,
      [runId]
    );

    // 5. Return events to frontend
    return res.json({
      runId,
      events: eventsResult.rows,
    });

  } catch (error) {
    console.error(
      '[Database] Failed to fetch agent events:',
      error.message
    );

    return res.status(500).json({
      error: 'Failed to fetch agent events.',
    });
  }
});


/**
 * Helper function to format and flush a Server-Sent Event (SSE) packet.
 * Standard SSE format:
 *   event: <EVENT_TYPE>\n
 *   data: <JSON_STRING>\n\n
 */
function sendSSE(res, eventType, payload) {
  if (res.writableEnded) return;
  const data = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...payload
  });
  res.write(`event: ${eventType}\n`);
  res.write(`data: ${data}\n\n`);
}

/**
 * 3. Primary SSE Streaming Endpoint (POST /api/agent/stream)
 * Accepts { "prompt": "..." } in the JSON body and streams real-time ReAct telemetry.
 */
app.post('/api/agent/stream', async (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({
      error: 'You must be logged in to start an agent run.',
    });
  }
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'A valid C++ problem "prompt" string is required.' });
  }

  // Configure strict SSE HTTP Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Prevents proxy buffering
  res.flushHeaders();

  // Track if the client closes the browser tab mid-execution
  let isClientConnected = true;

  // Send a heartbeat comment every 15s so local LLM inference (Ollama) doesn't time out the socket
  const heartbeatTimer = setInterval(() => {
    if (isClientConnected && !res.writableEnded) {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    }
  }, 15000);

  // req.on('close', () => {
  //   isClientConnected = false;
  //   clearInterval(heartbeatTimer);
  //   console.log('🔌 [SSE Client Disconnected]');
  // });

  res.on('close', () => {
    if (!res.writableEnded) {
      console.log('🔌 [SSE Client Disconnected]');
    }
    clearInterval(heartbeatTimer);
  });

  // Initial Handshake Event
  sendSSE(res, 'SYSTEM_READY', {
    type: 'SYSTEM_READY',
    message: 'Connected to Autonomous SWE Orchestrator. Initializing ReAct loop...',
    model: process.env.LLM_MODEL
  });

  let run = null;
  try {
    console.log('[AUTH DEBUG] Session ID:', req.sessionID);
    console.log('[AUTH DEBUG] User ID:', req.session?.userId);
    run = await createRun(prompt, req.session?.userId || null);

    // Execute the agent and stream its events.
    const finalSummary = await runAgentLoop(prompt, (agentEvent) => {
      if (!isClientConnected) return;

      // Keep the existing SSE event names unchanged.
      sendSSE(res, agentEvent.type, agentEvent);

      // Persist the event without blocking the SSE stream.
      saveRunEvent(run.id, agentEvent).catch((error) => {
        console.error('[Database] Failed to save agent event:', error.message);
      });
    });

    // Save the final run status.
    await finishRun(run.id, {
      status: finalSummary.success ? 'passed' : 'failed',
      iterations: finalSummary.iterationsUsed,
      finalAnswer: finalSummary.finalAnswer,
    });

    // Send the existing completion event.
    if (isClientConnected) {
      sendSSE(res, 'STREAM_COMPLETE', {
        type: 'STREAM_COMPLETE',
        success: finalSummary.success,
        iterationsUsed: finalSummary.iterationsUsed,
        finalAnswer: finalSummary.finalAnswer,
      });
    }
  } catch (error) {
    console.error('💥 [Orchestrator Stream Error]:', error.message);

    // Mark the run as errored if a database record was created.
    if (run) {
      try {
        await finishRun(run.id, {
          status: 'error',
          iterations: 0,
          finalAnswer: error.message,
        });
      } catch (dbError) {
        console.error('[Database] Failed to update run:', dbError.message);
      }
    }

    if (isClientConnected) {
      sendSSE(res, 'ERROR', {
        type: 'ERROR',
        message: error.message || 'Unexpected error during agent execution.',
      });
    }
  }


  finally {
    clearInterval(heartbeatTimer);
    if (!res.writableEnded) {
      res.end();
    }
  }
});

/**
 * 4. Optional GET SSE Endpoint (GET /api/agent/stream?prompt=...)
 * Useful for testing with native browser `new EventSource('/api/agent/stream?prompt=...')`
 */
app.get('/api/agent/stream', async (req, res) => {
  const prompt = req.query.prompt;
  if (!prompt) {
    return res.status(400).json({ error: 'Query parameter ?prompt=... is required.' });
  }
  req.body = { prompt };
  // Forward to the POST handler logic
  return app._router.handle(Object.assign(req, { method: 'POST' }), res, () => { });
});

/**
 * 5. Built-in Mock Sandbox Endpoint (POST /api/v1/mock-execute)
 * Allows you to test the ReAct loop & SSE streaming immediately even if the Go Docker container isn't running yet.
 * To use this mock, temporarily set SANDBOX_API_URL=http://localhost:3001/api/v1/mock-execute in your .env
 */
app.post('/api/v1/mock-execute', async (req, res) => {

  if (!req.session?.userId) {
    return res.status(401).json({
      error: 'You must be logged in to execute code.',
    });
  }

  const { source_code = '', stdin = '', expected_output = '' } = req.body;


  console.log(`🧪 [Mock Sandbox]: Received C++ code (${source_code.length} bytes)`);
  await new Promise((resolve) => setTimeout(resolve, 600)); // Simulate compile/run latency

  // Simulate Compilation Error if code is missing #include or main
  if (!source_code.includes('#include') || !source_code.includes('main')) {
    return res.json({
      passed: false,
      status: 'COMPILATION_ERROR',
      exit_code: 1,
      stdout: '',
      stderr: 'solution.cpp:1:1: error: expected #include directive and int main() entry point.',
      execution_time_ms: 0
    });
  }

  // Simulate 32-bit Integer Overflow bug detection (Self-Healing Test!)
  // If the problem requires 64-bit ints (long long) and the agent only used `int`, fail the test case:
  if (!source_code.includes('long long') && !source_code.includes('int64_t')) {
    return res.json({
      passed: false,
      status: 'WRONG_ANSWER',
      exit_code: 0,
      stdout: '-294967299\n',
      stderr: 'runtime warning: signed integer overflow: 1000000000 + 1000000000 cannot be represented in type \'int\'',
      execution_time_ms: 14
    });
  }

  // Otherwise, simulate a passing run!
  return res.json({
    passed: true,
    status: 'ACCEPTED',
    exit_code: 0,
    stdout: expected_output.trim() + '\n',
    stderr: '',
    execution_time_ms: 12
  });
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`\n=============================================================`);
  console.log(`⚡ AutoSWE Express SSE Server listening on http://localhost:${PORT}`);
  console.log(`   ├─ Health Check : GET  http://localhost:${PORT}/api/health`);
  console.log(`   ├─ SSE Stream   : POST http://localhost:${PORT}/api/agent/stream`);
  console.log(`   └─ Mock Sandbox : POST http://localhost:${PORT}/api/v1/mock-execute`);
  console.log(`=============================================================\n`);
});