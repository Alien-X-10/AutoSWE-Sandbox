import OpenAI from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import os from 'os';

const REPO_DIR = path.resolve('./repo');
if (!fs.existsSync(REPO_DIR)) {
  fs.mkdirSync(REPO_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(REPO_DIR, 'discount.cpp'),
    `#include <iostream>\nint main() {\n  int p, d; std::cin >> p >> d;\n  std::cout << (p + d) << std::endl; // BUG: should be p - d\n  return 0;\n}`
  );
}

// 1. Load environment variables
dotenv.config();

const MAX_ITERATIONS = parseInt(process.env.MAX_ITERATIONS || '5', 10);
const SANDBOX_API_URL = process.env.SANDBOX_API_URL || 'http://localhost:8080/api/v1/execute';
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o';

// 2. Initialize OpenAI Client
const openai = new OpenAI({
  baseURL: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
  apiKey: process.env.LLM_API_KEY || 'ollama',
  maxRetries: 0,
});

// Shared 21s Rate Limiter
const LIMIT_FILE = path.join(os.tmpdir(), 'autoswe_ratelimit.txt');
const REQUEST_GAP_MS = 21_000; // Max ~2.8 requests/min (< 5 RPM limit)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let requestQueue = Promise.resolve();

function summarizeReasoning(rawText = '') {
  const cleaned = String(rawText)
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```[\s\S]*?```/g, '[code block]')
    .trim();
  if (!cleaned) return '';
  const firstLines = cleaned.split('\n').filter(Boolean).slice(0, 2).join(' ');
  return firstLines.length > 260 ? `${firstLines.slice(0, 257)}...` : firstLines;
}

async function chatCompletionWithRateLimit(params, onEvent, iteration = 0) {
  const task = requestQueue.then(async () => {
    const lastTime = fs.existsSync(LIMIT_FILE) ? Number(fs.readFileSync(LIMIT_FILE, 'utf8')) : 0;
    const waitMs = Math.max(0, REQUEST_GAP_MS - (Date.now() - lastTime));

    if (waitMs > 0) {
      const waitSec = (waitMs / 1000).toFixed(1);
      console.log(`[Rate limiter] Waiting ${waitSec}s`);
      onEvent?.({
        schemaVersion: 2,
        type: 'THOUGHT',
        category: 'rate_limit',
        iteration,
        waitMs,
        summary: `Rate limiter cooldown: waiting ${waitSec}s (5 RPM guard)`,
        content: `⏳ Rate limiter: cooling down ${waitSec}s (staying under 5 RPM)...`
      });
      await sleep(waitMs);
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log('[Rate limiter] Sending LLM request');
        return await openai.chat.completions.create(params);
      } catch (err) {
        if (err.status === 429 && attempt < 3) {
          console.log('[Rate limiter] 429 hit! Cooling down 35s...');
          onEvent?.({
            schemaVersion: 2,
            type: 'THOUGHT',
            category: 'rate_limit',
            iteration,
            waitMs: 35000,
            summary: `HTTP 429 rate limit hit (Attempt ${attempt}/3). Cooling down 35s...`,
            content: `⏳ Rate limiter: HTTP 429 hit, cooling down 35.0s before retry #${attempt + 1}...`
          });
          await sleep(35_000);
        } else throw err;
      } finally {
        fs.writeFileSync(LIMIT_FILE, String(Date.now()));
      }
    }
  });
  requestQueue = task.catch(() => {});
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

// 4. Define the Strict JSON Schema for Tools
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
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Sandbox HTTP ${response.status}: ${errorText}`);
    }

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
 */
export async function runAgentLoop(problemPrompt, onEvent = () => {}) {
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
    onEvent({
      schemaVersion: 2,
      type: 'ITERATION_START',
      iteration,
      maxIterations: MAX_ITERATIONS,
      message: `Starting Iteration ${iteration} of ${MAX_ITERATIONS}`
    });

    let response;
    try {
      response = await chatCompletionWithRateLimit(
        {
          model: LLM_MODEL,
          messages: messages,
          tools: tools,
          tool_choice: 'auto',
          temperature: 0.1
        },
        onEvent,
        iteration
      );
    } catch (llmError) {
      console.error(`❌ [LLM API Error]:`, llmError.message);
      throw llmError;
    }

    const assistantMessage = response.choices[0].message;
    messages.push(assistantMessage);

    if (assistantMessage.content) {
      console.log(`🧠 [Agent Thought]:\n${assistantMessage.content}\n`);
      onEvent({
        schemaVersion: 2,
        type: 'THOUGHT',
        category: 'reasoning',
        iteration,
        summary: summarizeReasoning(assistantMessage.content),
        content: assistantMessage.content
      });
    }

    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      console.log(`✅ [Agent Terminated Loop]: Final answer produced on iteration ${iteration}.`);
      onEvent({
        schemaVersion: 2,
        type: 'FINAL_ANSWER',
        iteration,
        solved: isSolved,
        summary: summarizeReasoning(assistantMessage.content) || 'Agent completed reasoning loop.',
        content: assistantMessage.content
      });
      return {
        success: isSolved,
        iterationsUsed: iteration,
        finalAnswer: assistantMessage.content,
        history: messages
      };
    }

    for (const toolCall of assistantMessage.tool_calls) {
      const { id: toolCallId, function: fn } = toolCall;

      let parsedArgs;
      try {
        parsedArgs = JSON.parse(fn.arguments);
      } catch (parseError) {
        console.warn(`⚠️ [Malformed Tool JSON]: Asking LLM to regenerate valid JSON.`);
        onEvent({
          schemaVersion: 2,
          type: 'TOOL_CALL',
          iteration,
          tool: fn.name || 'unknown_tool',
          toolCallId,
          status: 'MALFORMED_TOOL_ARGUMENTS',
          reasoning: `Malformed tool JSON arguments (${parseError.message}). Requesting self-correction.`,
          error: parseError.message
        });
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
          const files = fs.readdirSync(REPO_DIR);
          out = JSON.stringify({ files });
          onEvent({
            schemaVersion: 2,
            type: 'TOOL_CALL',
            iteration,
            tool: 'list_files',
            toolCallId,
            args: { directory: './repo' },
            reasoning: `Listed ${files.length} file(s) in ./repo: ${files.join(', ')}`,
            resultSummary: out
          });
        } else if (fn.name === 'read_file') {
          const safeFile = path.basename(parsedArgs.filepath || '');
          const fullPath = path.join(REPO_DIR, safeFile);
          out = fs.existsSync(fullPath)
            ? fs.readFileSync(fullPath, 'utf8')
            : `ERROR: File "${safeFile}" not found in ./repo`;
          onEvent({
            schemaVersion: 2,
            type: 'TOOL_CALL',
            iteration,
            tool: 'read_file',
            toolCallId,
            args: { filepath: safeFile, bytes: out.length },
            reasoning: `Read ./repo/${safeFile} (${out.length} bytes)`,
            code: out
          });
        } else if (fn.name === 'write_file') {
          const safeFile = path.basename(parsedArgs.filepath || '');
          const content = parsedArgs.content || '';
          fs.writeFileSync(path.join(REPO_DIR, safeFile), content, 'utf8');
          out = JSON.stringify({ patched: safeFile });
          onEvent({
            schemaVersion: 2,
            type: 'TOOL_CALL',
            iteration,
            tool: 'write_file',
            toolCallId,
            args: { filepath: safeFile, bytes: content.length },
            reasoning: `Patched ./repo/${safeFile} (${content.length} bytes)`,
            code: content
          });
        }
        messages.push({ role: 'tool', tool_call_id: toolCallId, content: out });
        continue;
      }

      const sourceCode = parsedArgs.cpp_source_code || '';
      const codeLines = sourceCode ? sourceCode.split('\n').length : 0;

      console.log(`🛠  [Tool Call: execute_cpp_code]`);
      console.log(`   ├─ Reasoning: ${parsedArgs.reasoning}`);
      console.log(`   └─ Dispatching C++ payload (${sourceCode.length} bytes) to Go Sandbox...`);

      onEvent({
        schemaVersion: 2,
        type: 'TOOL_CALL',
        iteration,
        tool: 'execute_cpp_code',
        toolCallId,
        reasoning: parsedArgs.reasoning,
        args: {
          stdin_input: parsedArgs.stdin_input,
          expected_output: parsedArgs.expected_output,
          code_bytes: sourceCode.length,
          code_lines: codeLines
        },
        code: sourceCode,
        stdin: parsedArgs.stdin_input,
        expectedOutput: parsedArgs.expected_output
      });

      const sandboxResult = await callGoSandbox(parsedArgs);

      if (sandboxResult.passed) {
        isSolved = true;
        console.log(`🟢 [Sandbox Result]: PASSED (${sandboxResult.execution_time_ms}ms)`);
      } else {
        console.log(`🔴 [Sandbox Result]: FAILED | Status: ${sandboxResult.status} | Exit Code: ${sandboxResult.exit_code}`);
        if (sandboxResult.stderr) {
          console.log(`   └─ Stderr Trace: ${sandboxResult.stderr.trim().slice(0, 300)}`);
        }
      }

      onEvent({
        schemaVersion: 2,
        type: 'SANDBOX_RESULT',
        iteration,
        result: sandboxResult,
        sandboxMeta: {
          language: 'C++20',
          compiler: 'g++ -std=c++20 -O2',
          timeLimitMs: 2000,
          memoryLimitKb: 262144
        },
        io: {
          stdin: parsedArgs.stdin_input || '',
          expectedOutput: parsedArgs.expected_output || '',
          actualOutput: (sandboxResult.stdout || '').slice(0, 4000),
          stderr: (sandboxResult.stderr || '').slice(0, 4000)
        }
      });

      const toolFeedbackPayload = formatSandboxFeedback(sandboxResult);
      messages.push({
        role: 'tool',
        tool_call_id: toolCallId,
        content: toolFeedbackPayload
      });

      if (sandboxResult.passed) {
        console.log('[Agent] Verified solution found. Stopping further API calls.');
        const finalAnswer =
          parsedArgs.cpp_source_code ||
          assistantMessage.content ||
          'The C++ solution passed sandbox verification.';

        onEvent({
          schemaVersion: 2,
          type: 'FINAL_ANSWER',
          iteration,
          solved: true,
          summary: `Verified C++20 solution passed all sandbox tests in ${sandboxResult.execution_time_ms || 0}ms on Iteration ${iteration}.`,
          content: finalAnswer
        });

        return {
          success: true,
          iterationsUsed: iteration,
          finalAnswer,
          history: messages
        };
      }
    }
  }

  console.warn(`\n⛔️ [Guardrail Triggered]: Reached MAX_ITERATIONS (${MAX_ITERATIONS}) without final termination.`);

  onEvent({
    schemaVersion: 2,
    type: 'MAX_ITERATIONS_REACHED',
    iteration: MAX_ITERATIONS,
    maxIterations: MAX_ITERATIONS,
    solved: isSolved,
    message: `Reached maximum limit of ${MAX_ITERATIONS} iterations without passing verification.`
  });

  return {
    success: isSolved,
    iterationsUsed: MAX_ITERATIONS,
    finalAnswer: 'Max iterations reached before the agent could converge on a verified solution.',
    history: messages
  };
}

// --- CLI Smoke Test Entrypoint ---
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