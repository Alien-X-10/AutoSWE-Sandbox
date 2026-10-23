import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { runAgentLoop } from './agent.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// 1. Middleware Setup
app.use(cors({
  origin: '*', // Allow React client (Vite/Next.js) to connect from any local port
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '2mb' }));

// 2. Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'AutoSWE Node.js Orchestrator',
    model: process.env.LLM_MODEL || 'qwen2.5-coder:14b',
    sandboxUrl: process.env.SANDBOX_API_URL || 'http://localhost:8080/api/v1/execute',
    maxIterations: parseInt(process.env.MAX_ITERATIONS || '5', 10)
  });
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

  req.on('close', () => {
    isClientConnected = false;
    clearInterval(heartbeatTimer);
    console.log('🔌 [SSE Client Disconnected]');
  });

  // Initial Handshake Event
  sendSSE(res, 'SYSTEM_READY', {
    type: 'SYSTEM_READY',
    message: 'Connected to Autonomous SWE Orchestrator. Initializing ReAct loop...',
    model: process.env.LLM_MODEL
  });

  try {
    // Execute the ReAct loop and pipe every internal event directly to the SSE stream
    const finalSummary = await runAgentLoop(prompt, (agentEvent) => {
      if (!isClientConnected) return;
      sendSSE(res, agentEvent.type, agentEvent);
    });

    // Send final completion signal before closing the stream
    if (isClientConnected) {
      sendSSE(res, 'STREAM_COMPLETE', {
        type: 'STREAM_COMPLETE',
        success: finalSummary.success,
        iterationsUsed: finalSummary.iterationsUsed,
        finalAnswer: finalSummary.finalAnswer
      });
    }
  } catch (error) {
    console.error('💥 [Orchestrator Stream Error]:', error.message);
    if (isClientConnected) {
      sendSSE(res, 'ERROR', {
        type: 'ERROR',
        message: error.message || 'Unexpected error during agent execution.'
      });
    }
  } finally {
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
  return app._router.handle(Object.assign(req, { method: 'POST' }), res, () => {});
});

/**
 * 5. Built-in Mock Sandbox Endpoint (POST /api/v1/mock-execute)
 * Allows you to test the ReAct loop & SSE streaming immediately even if the Go Docker container isn't running yet.
 * To use this mock, temporarily set SANDBOX_API_URL=http://localhost:3001/api/v1/mock-execute in your .env
 */
app.post('/api/v1/mock-execute', async (req, res) => {
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