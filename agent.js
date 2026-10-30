import OpenAI from 'openai';
import dotenv from 'dotenv';


import fs from 'fs';
import path from 'path';

const REPO_DIR = path.resolve('./repo');
if (!fs.existsSync(REPO_DIR)) {
  fs.mkdirSync(REPO_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPO_DIR, 'discount.cpp'), `#include <iostream>\nint main() {\n  int p, d; std::cin >> p >> d;\n  std::cout << (p + d) << std::endl; // BUG: should be p - d\n  return 0;\n}`);
}



// 1. Load environment variables
dotenv.config();

const MAX_ITERATIONS = parseInt(process.env.MAX_ITERATIONS || '5', 10);
const SANDBOX_API_URL = process.env.SANDBOX_API_URL || 'http://localhost:8080/api/v1/execute';
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o';

// 2. Initialize OpenAI Client (Supports both Cloud APIs and Local Ollama)
// const openai = new OpenAI({
//   baseURL: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
//   apiKey: process.env.LLM_API_KEY || 'ollama', // Ollama requires a non-empty dummy string
// });

const openai = new OpenAI({
  baseURL: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
  apiKey: process.env.LLM_API_KEY || 'ollama',
  maxRetries: 0,
});

// Shared request limiter: at least 20 seconds between request starts.
// const REQUEST_GAP_MS = 21_000;

// const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// let requestQueue = Promise.resolve();
// let lastRequestStartedAt = 0;

// async function chatCompletionWithRateLimit(params) {
//   const task = requestQueue.then(async () => {
//     const elapsed = Date.now() - lastRequestStartedAt;
//     const waitMs = Math.max(0, REQUEST_GAP_MS - elapsed);

//     if (waitMs > 0) {
//       console.log(`[Rate limiter] Waiting ${(waitMs / 1000).toFixed(1)}s`);
//       await sleep(waitMs);
//     }

//     lastRequestStartedAt = Date.now();
//     console.log('[Rate limiter] Sending LLM request');

//     return openai.chat.completions.create(params);
//   });

//   requestQueue = task.then(
//     () => undefined,
//     () => undefined
//   );

//   return task;
// }

import os from 'os';
const LIMIT_FILE = path.join(os.tmpdir(), 'autoswe_ratelimit.txt');
const REQUEST_GAP_MS = 21_000; // Max ~2.8 requests/min (< 5 RPM limit)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let requestQueue = Promise.resolve();

async function chatCompletionWithRateLimit(params, onEvent) {
  const task = requestQueue.then(async () => {
    const lastTime = fs.existsSync(LIMIT_FILE) ? Number(fs.readFileSync(LIMIT_FILE, 'utf8')) : 0;
    const waitMs = Math.max(0, REQUEST_GAP_MS - (Date.now() - lastTime));

    if (waitMs > 0) {
      console.log(`[Rate limiter] Waiting ${(waitMs / 1000).toFixed(1)}s`);
      onEvent?.({ type: 'THOUGHT', content: `⏳ Rate limiter: cooling down ${(waitMs / 1000).toFixed(1)}s (staying under 5 RPM)...` });
      await sleep(waitMs);
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log('[Rate limiter] Sending LLM request');
        return await openai.chat.completions.create(params);
      } catch (err) {
        if (err.status === 429 && attempt < 3) {
          console.log('[Rate limiter] 429 hit! Cooling down 35s...');
          await sleep(35_000);
        } else throw err;
      } finally {
        fs.writeFileSync(LIMIT_FILE, String(Date.now()));
      }
    }
  });
  requestQueue = task.catch(() => { });
  return task;
}


// 3. Define the System Prompt for the Autonomous C++ SWE Agent
const SYSTEM_PROMPT = `You are an autonomous Principal C++ Software Engineering Agent.
Your objective is to solve algorithmic and systems programming problems by writing clean, optimal C++20 code, testing it in an isolated execution sandbox, and iteratively fixing any bugs until all tests pass.

OPERATIONAL PROTOCOL (ReAct Pattern):
1. REASON: Before invoking any tool, analyze the problem constraints (time/space complexity, edge cases, integer overflow, memory bounds).
2. ACT: Call the \`execute_cpp_code\` tool with a complete, self-contained C++ source file (including all required headers and \`int main()\`).
3. OBSERVE & SELF-CORRECT:
   - If compilation fails (status: "COMPILATION_ERROR"), read the exact line numbers and compiler diagnostics in \`stderr\`. Fix syntax or type errors immediately.
   - If a runtime crash occurs (e.g., SIGSEGV / Exit Code 139, SIGABRT, or Time Limit Exceeded), inspect pointer arithmetic, vector out-of-bounds accesses, or infinite recursion.
   - If test cases fail (status: "WRONG_ANSWER"), compare \`stdout\` against expected output and fix your algorithmic logic.
4. TERMINATE: Once the sandbox returns \`passed: true\` (all tests passing), stop calling tools and provide a concise final summary of your solution and its complexity.
You can also inspect and patch ./repo files using list_files, read_file, and write_file.`;

// 4. Define the Strict JSON Schema for the `execute_cpp_code` Tool
const tools = [
  { type: 'function', function: { name: 'list_files', description: 'List files in ./repo', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'read_file', description: 'Read file in ./repo', parameters: { type: 'object', properties: { filepath: { type: 'string' } }, required: ['filepath'] } } },
  { type: 'function', function: { name: 'write_file', description: 'Write file in ./repo', parameters: { type: 'object', properties: { filepath: { type: 'string' }, content: { type: 'string' } }, required: ['filepath', 'content'] } } },

  {
    type: 'function',
    function: {
      name: 'execute_cpp_code',
      description: 'Compiles and executes C++20 source code inside an isolated Docker/Isolate sandbox against provided stdin test inputs. Returns stdout, stderr, exit code, execution time, and pass/fail status.',
      strict: true,
      parameters: {
        type: 'object',
        properties: {
          reasoning: {
            type: 'string',
            description: 'Brief explanation of the approach being tested or the specific bug being fixed in this iteration.'
          },
          cpp_source_code: {
            type: 'string',
            description: 'Complete, compilable C++20 source code including #include directives and main() function.'
          },
          stdin_input: {
            type: 'string',
            description: 'Standard input (stdin) payload to feed into the compiled binary during execution.'
          },
          expected_output: {
            type: 'string',
            description: 'The exact expected stdout string to verify correctness against.'
          }
        },
        required: ['reasoning', 'cpp_source_code', 'stdin_input', 'expected_output'],
        additionalProperties: false
      }
    }
  }
];

/**
 * Dispatches C++ source code and test inputs to the Go + Docker + Isolate Sandbox.
 * Includes fallback mock support if the Go server is offline during initial testing.
 */
async function callGoSandbox({ cpp_source_code, stdin_input, expected_output }) {
  try {
    const response = await fetch(SANDBOX_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: 'cpp',
        source_code: cpp_source_code,
        stdin: stdin_input,
        expected_output: expected_output,
        time_limit_ms: 2000,
        memory_limit_kb: 262144 // 256 MB
      }),
      signal: AbortSignal.timeout(10000) // Hard 10s network timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Sandbox HTTP ${response.status}: ${errorText}`);
    }

    // Expected JSON structure from Go Sandbox:
    // { passed: boolean, status: string, exit_code: number, stdout: string, stderr: string, execution_time_ms: number }
    return await response.json();

  } catch (error) {
    console.error(`[Sandbox Network Error]: ${error.message}`);
    return {
      passed: false,
      status: 'SANDBOX_INFRASTRUCTURE_ERROR',
      exit_code: -1,
      stdout: '',
      stderr: `Failed to reach Go Execution Sandbox at ${SANDBOX_API_URL}. Error: ${error.message}`,
      execution_time_ms: 0
    };
  }
}

/**
 * Formats the Go Sandbox response into a structured diagnostic payload for the LLM context window.
 */
function formatSandboxFeedback(result) {
  // Truncate overly massive outputs (e.g., infinite print loops) to protect context window limits
  const MAX_LOG_LEN = 4000;
  const cleanStdout = (result.stdout || '').slice(0, MAX_LOG_LEN);
  const cleanStderr = (result.stderr || '').slice(0, MAX_LOG_LEN);

  const diagnostic = {
    passed: Boolean(result.passed),
    status: result.status || (result.exit_code === 0 ? 'FINISHED' : 'RUNTIME_ERROR'),
    exit_code: result.exit_code,
    execution_time_ms: result.execution_time_ms || 0,
    stdout: cleanStdout,
    stderr: cleanStderr,
    self_correction_directive: result.passed
      ? 'ALL TESTS PASSED. Do not call execute_cpp_code again. Present the final verified solution to the user.'
      : 'EXECUTION FAILED. Analyze the stderr/stdout and exit_code above, identify the root cause, and invoke execute_cpp_code with the corrected C++ code.'
  };

  return JSON.stringify(diagnostic, null, 2);
}

/**
 * Core Asynchronous ReAct Loop
 * @param {string} problemPrompt - The C++ problem description and test constraints.
 * @param {function} onEvent - Optional callback for streaming real-time telemetry (used later for React SSE).
 */
export async function runAgentLoop(problemPrompt, onEvent = () => { }) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: problemPrompt }
  ];

  let iteration = 0;
  let isSolved = false;

  console.log(`\n=============================================================`);
  console.log(`🚀 Starting Autonomous SWE Agent | Model: ${LLM_MODEL}`);
  console.log(`=============================================================\n`);

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    console.log(`\n--- [Iteration ${iteration}/${MAX_ITERATIONS}] Requesting LLM Reasoning ---`);
    onEvent({ type: 'ITERATION_START', iteration, maxIterations: MAX_ITERATIONS });

    let response;
    try {
      // response = await openai.chat.completions.create({
      response = await chatCompletionWithRateLimit({
        model: LLM_MODEL,
        messages: messages,
        tools: tools,
        tool_choice: 'auto',
        temperature: 0.1 // Low temperature for deterministic code generation
      }, onEvent);
    } catch (llmError) {
      console.error(`❌ [LLM API Error]:`, llmError.message);
      onEvent({ type: 'ERROR', message: llmError.message });
      throw llmError;
    }

    const assistantMessage = response.choices[0].message;

    // 1. Append the assistant's exact response (including any tool_calls) to conversation history
    messages.push(assistantMessage);

    // Log internal monologue if the LLM emitted plain text alongside or instead of a tool call
    if (assistantMessage.content) {
      console.log(`🧠 [Agent Thought]:\n${assistantMessage.content}\n`);
      onEvent({ type: 'THOUGHT', iteration, content: assistantMessage.content });
    }

    // 2. Check if the LLM decided it is finished (No tool calls emitted)
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      console.log(`✅ [Agent Terminated Loop]: Final answer produced on iteration ${iteration}.`);
      onEvent({
        type: 'FINAL_ANSWER',
        iteration,
        solved: isSolved,
        content: assistantMessage.content
      });
      return {
        success: isSolved,
        iterationsUsed: iteration,
        finalAnswer: assistantMessage.content,
        history: messages
      };
    }

    // 3. Process all tool calls requested by the LLM in this turn
    for (const toolCall of assistantMessage.tool_calls) {
      const { id: toolCallId, function: fn } = toolCall;

      // if (fn.name !== 'execute_cpp_code') {
      //   messages.push({
      //     role: 'tool',
      //     tool_call_id: toolCallId,
      //     content: JSON.stringify({ error: `Unknown tool "${fn.name}". Only execute_cpp_code is supported.` })
      //   });
      //   continue;
      // }

      // Safely parse the LLM's JSON arguments
      let parsedArgs;
      try {
        parsedArgs = JSON.parse(fn.arguments);
      } catch (parseError) {
        console.warn(`⚠️ [Malformed Tool JSON]: Asking LLM to regenerate valid JSON.`);
        messages.push({
          role: 'tool',
          tool_call_id: toolCallId,
          content: JSON.stringify({
            passed: false,
            status: 'MALFORMED_TOOL_ARGUMENTS',
            stderr: `Failed to parse tool JSON arguments: ${parseError.message}. Ensure strings and newlines in cpp_source_code are properly escaped.`
          })
        });
        continue;
      }

      if (fn.name !== 'execute_cpp_code') {
        let out = '';
        if (fn.name === 'list_files') {
          out = JSON.stringify({ files: fs.readdirSync(REPO_DIR) });
          onEvent({ type: 'THOUGHT', iteration, content: `📂 Repo files: ${out}` });
        } else if (fn.name === 'read_file') {
          out = fs.readFileSync(path.join(REPO_DIR, path.basename(parsedArgs.filepath)), 'utf8');
          onEvent({ type: 'TOOL_CALL', iteration, reasoning: `Read ${parsedArgs.filepath}`, code: out });
        } else if (fn.name === 'write_file') {
          fs.writeFileSync(path.join(REPO_DIR, path.basename(parsedArgs.filepath)), parsedArgs.content, 'utf8');
          out = JSON.stringify({ patched: parsedArgs.filepath });
          onEvent({ type: 'TOOL_CALL', iteration, reasoning: `Patched ${parsedArgs.filepath}`, code: parsedArgs.content });
        }
        messages.push({ role: 'tool', tool_call_id: toolCallId, content: out });
        continue;
      }

      console.log(`🛠️  [Tool Call: execute_cpp_code]`);
      console.log(`   ├─ Reasoning: ${parsedArgs.reasoning}`);
      console.log(`   └─ Dispatching C++ payload (${parsedArgs.cpp_source_code.length} bytes) to Go Sandbox...`);

      onEvent({
        type: 'TOOL_CALL',
        iteration,
        reasoning: parsedArgs.reasoning,
        code: parsedArgs.cpp_source_code,
        stdin: parsedArgs.stdin_input,
        expectedOutput: parsedArgs.expected_output
      });

      // 4. Execute C++ code in the Go + Docker + Isolate Sandbox
      const sandboxResult = await callGoSandbox(parsedArgs);

      // if (sandboxResult.passed) {
      //   isSolved = true;
      //   console.log(`🟢 [Sandbox Result]: PASSED (${sandboxResult.execution_time_ms}ms)`);
      // } else {
      //   console.log(`🔴 [Sandbox Result]: FAILED | Status: ${sandboxResult.status} | Exit Code: ${sandboxResult.exit_code}`);
      //   if (sandboxResult.stderr) {
      //     console.log(`   └─ Stderr Trace: ${sandboxResult.stderr.trim().slice(0, 300)}`);
      //   }
      // }

      if (sandboxResult.passed) {
        isSolved = true;
        console.log(
          `🟢 [Sandbox Result]: PASSED (${sandboxResult.execution_time_ms}ms)`
        );
      } else {
        console.log(
          `🔴 [Sandbox Result]: FAILED | Status: ${sandboxResult.status} | Exit Code: ${sandboxResult.exit_code}`
        );

        if (sandboxResult.stderr) {
          console.log(`   └─ Stderr Trace: ${sandboxResult.stderr.trim().slice(0, 300)}`);
        }
      }

      onEvent({
        type: 'SANDBOX_RESULT',
        iteration,
        result: sandboxResult
      });

      // 5. Feed the structured execution trace back into the LLM's context window
      const toolFeedbackPayload = formatSandboxFeedback(sandboxResult);

      messages.push({
        role: 'tool',
        tool_call_id: toolCallId,
        content: toolFeedbackPayload
      });

      // STOP immediately when the sandbox verifies the solution
      if (sandboxResult.passed) {
        console.log(
          '[Agent] Verified solution found. Stopping further API calls.'
        );

        const finalAnswer =
          parsedArgs.cpp_source_code ||
          assistantMessage.content ||
          'The C++ solution passed sandbox verification.';

        onEvent({
          type: 'FINAL_ANSWER',
          iteration,
          solved: true,
          content: finalAnswer,
        });

        return {
          success: true,
          iterationsUsed: iteration,
          finalAnswer,
          history: messages,
        };
      }

    } // End of for (const toolCall ...)
  }   // End of while (iteration < MAX_ITERATIONS)

  // 6. Guardrail triggered: Max iterations exhausted without convergence
  console.warn(
    `\n⛔ [Guardrail Triggered]: Reached MAX_ITERATIONS (${MAX_ITERATIONS}) without final termination.`
  );

  onEvent({
    type: 'MAX_ITERATIONS_REACHED',
    maxIterations: MAX_ITERATIONS,
    solved: isSolved
  });

  return {
    success: isSolved,
    iterationsUsed: MAX_ITERATIONS,
    finalAnswer: 'Max iterations reached before the agent could converge on a verified solution.',
    history: messages
  };
}


// --- CLI Smoke Test Entrypoint ---
// Runs only when executing `node agent.js` directly in your terminal
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('agent.js')) {
  const sampleProblem = `
Problem: Find the Maximum Subarray Sum (Kadane's Algorithm) with 64-bit integers.
Write a C++20 program that reads an integer N from stdin, followed by N space-separated integers (which can be negative and up to 10^9 in magnitude).
Print the maximum contiguous subarray sum.
Test Input (stdin):
5
-2 1000000000 -3 1000000000 -1
Expected Output:
1999999997
`;

  runAgentLoop(sampleProblem)
    .then((res) => {
      console.log('\n=== Final Execution Summary ===');
      console.log(`Solved: ${res.success} | Iterations: ${res.iterationsUsed}`);
      console.log(`Output:\n${res.finalAnswer}`);
    })
    .catch((err) => console.error('Fatal Agent Crash:', err));
}