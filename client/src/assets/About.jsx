import React, { useState, useEffect } from 'react';
import './About.css';

const FLOW_STEPS = [
  {
    id: 1,
    stage: 'INPUT (:5173)',
    eventTag: 'POST /api/agent/stream',
    title: '1. User Submits Problem or Buggy File',
    simple: 'You type a coding problem, test inputs, and expected answer (or upload a broken .cpp file) and click Run Agent.',
    technical: 'React client packages Problem Description + stdin + expected_output into a prompt payload and opens a persistent Server-Sent Events (SSE) stream to port 3001.',
    color: '#f9dc8c'
  },
  {
    id: 2,
    stage: 'ORCHESTRATOR (:3001)',
    eventTag: 'event: ITERATION_START',
    title: '2. ReAct Loop & 21s Rate-Limit Guard',
    simple: 'The Node.js manager starts Attempt #1 and makes sure we never exceed free AI speed limits.',
    technical: 'agent.js initializes conversation memory, enforces the 21,000ms (5 RPM) persistent request queue (maxRetries: 0), and emits ITERATION_START to the browser.',
    color: '#e2b453'
  },
  {
    id: 3,
    stage: 'THE BRAIN (LLM)',
    eventTag: 'event: THOUGHT + TOOL_CALL',
    title: '3. AI Reasons & Invokes a Tool',
    simple: 'The AI thinks through the math, inspects ./repo files if needed, and writes a complete C++20 program.',
    technical: 'Gemini 2.5 Flash / Qwen2.5-Coder (temp 0.1) outputs reasoning and triggers strict JSON tool calls: list_files, read_file, write_file, or execute_cpp_code.',
    color: '#c792ea'
  },
  {
    id: 4,
    stage: 'DOCKER SANDBOX (:8085)',
    eventTag: 'event: SANDBOX_RESULT (FAIL)',
    title: '4. Attempt 1 Fails in Safe Test Room',
    simple: 'Inside a locked Docker container, the code is compiled and tested. Suppose Attempt 1 uses 32-bit int and overflows!',
    technical: 'Isolated container compiles with g++ -std=c++20 -O2 (256MB RAM cap, 2s timeout). Binary outputs -294967296 instead of 4000000000 -> returns status: WRONG_ANSWER + stderr.',
    color: '#f85149'
  },
  {
    id: 5,
    stage: 'SELF-HEALING LOOP',
    eventTag: 'event: TOOL_CALL (Iter 2)',
    title: '5. Automatic Feedback & Bug Patch',
    simple: 'Instead of giving up, the error log is fed right back to the AI. It spots the overflow and upgrades int to 64-bit long long.',
    technical: 'formatSandboxFeedback() truncates stdout/stderr to 4,000 chars and appends a self-correction directive to messages[]. Iteration 2 patches the C++ code and re-tests.',
    color: '#7cd4fd'
  },
  {
    id: 6,
    stage: 'VERIFIED OUTPUT (:5173)',
    eventTag: 'event: FINAL_ANSWER',
    title: '6. All Tests Pass -> Stream Complete',
    simple: 'The fixed code passes in 12ms! You see the green Passed badge, the red/green code diff, and the saved run in History.',
    technical: 'Sandbox returns passed: true (ACCEPTED). Orchestrator exits the while loop early to save tokens, persists the trace to History, and closes the SSE stream.',
    color: '#25d366'
  }
];

const ARCHITECTURE_LAYERS = [
  {
    layer: 'LAYER 1',
    icon: '🧠',
    name: 'The Brain (LLM Inference Engine)',
    simple: 'Think of this as the senior programmer’s mind. It reads your problem, plans an algorithm, and decides which tool to use next.',
    specs: [
      'Models: Gemini 2.5 Flash (Cloud) or Qwen2.5-Coder:14b (Local Ollama)',
      'Deterministic sampling (temperature: 0.1) for syntax accuracy',
      'Strict JSON Schema function calling (additionalProperties: false)',
      'Zero-code-change switching via OpenAI-compatible SDK baseURL'
    ]
  },
  {
    layer: 'LAYER 2',
    icon: '🔄',
    name: 'The Manager (Node.js ReAct Orchestrator)',
    simple: 'Think of this as the project manager. It passes messages between the AI Brain, your local ./repo files, the Docker test room, and your browser screen.',
    specs: [
      'Files: server.js + agent.js running on http://localhost:3001',
      'Enforces MAX_ITERATIONS = 5 and early loop termination on PASSED',
      'Built-in 21-second (5 RPM) rate-limiter queue preventing HTTP 429 errors',
      'Streams real-time telemetry frames over Server-Sent Events (SSE)'
    ]
  },
  {
    layer: 'LAYER 3',
    icon: '🛡️',
    name: 'The Safe Test Room (Docker C++20 Sandbox)',
    simple: 'A sealed virtual mini-computer inside your PC. Even if the AI writes a program that crashes or loops forever, it can never harm your real machine.',
    specs: [
      'Container: Isolated g++ (C++20, -O2) service on port 8085 -> 8080',
      'Resource Limits: 256 MB RAM ceiling, 2,000ms execution timeout',
      'Auto-inlines local #include "file.h" headers from ./repo before compiling',
      'Captures exact exit_code, stdout, stderr, and execution_time_ms'
    ]
  },
  {
    layer: 'LAYER 4',
    icon: '🖥️',
    name: 'The Control Room (React 19 Telemetry IDE)',
    simple: 'The dashboard you are using right now. It lets you watch every thought, inspect red/green code fixes across attempts, and review past runs.',
    specs: [
      '3-Column Obsidian & Gold IDE running on Vite (http://localhost:5173)',
      'Iteration version switcher (Iter 1, Iter 2) + visual Diff vs Iter 1 mode',
      'Direct .cpp / .h file upload into ./repo workspace',
      'Persistent Run History viewer (/api/agent/runs) with full event replay'
    ]
  }
];

const GLOSSARY = [
  {
    term: 'ReAct (Reason + Act)',
    desc: 'An AI design pattern where the model must think out loud ("Reason") and run a real tool ("Act"), then observe the real-world result before deciding its next move.'
  },
  {
    term: 'Docker Sandbox',
    desc: 'An isolated, locked container with strict memory (256MB) and time (2s) limits where experimental C++ code is compiled and tested safely.'
  },
  {
    term: 'SSE (Server-Sent Events)',
    desc: 'A live one-way data connection that pushes each AI thought, tool call, and compiler result to your browser the millisecond it happens.'
  },
  {
    term: 'stdin / stdout / stderr',
    desc: 'Standard Input (test numbers fed into the program), Standard Output (the program’s printed answer), and Standard Error (compiler or crash diagnostics).'
  },
  {
    term: '32-bit Integer Overflow',
    desc: 'A classic C++ bug where a standard "int" variable exceeds ~2.14 billion and wraps around into a negative number, requiring 64-bit "long long".'
  },
  {
    term: 'SIGSEGV (Segmentation Fault)',
    desc: 'A critical runtime crash (Exit Code 139) caused when a program tries to access array elements or memory pointers outside allowed boundaries.'
  }
];

export default function About({ onNavigateWorkspace }) {
  const [activeStep, setActiveStep] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);

  useEffect(() => {
    if (!isSimulating) return;
    const timer = setInterval(() => {
      setActiveStep((prev) => {
        if (prev >= FLOW_STEPS.length) {
          setIsSimulating(false);
          return 6;
        }
        return prev + 1;
      });
    }, 1800);
    return () => clearInterval(timer);
  }, [isSimulating]);

  const startSimulation = () => {
    setActiveStep(1);
    setIsSimulating(true);
  };

  const resetSimulation = () => {
    setIsSimulating(false);
    setActiveStep(0);
  };

  return (
    <div className="about-scroll-container">
      <div className="about-inner">
        {/* 1. HERO & PLAIN-ENGLISH COMPARISON */}
        <section className="about-hero">
          <div className="about-badge-row">
            <span className="about-pill">⚡ Autonomous ReAct Agent</span>
            <span className="about-pill">🛡️ Docker C++20 Isolation</span>
            <span className="about-pill">⏱️ 21s 5-RPM Rate Limiter</span>
            <span className="about-pill">📡 Live SSE Telemetry</span>
            <span className="about-pill">📁 Multi-File ./repo Patching</span>
          </div>

          <h1>What is AutoSWE Sandbox?</h1>
          <p className="about-hero-lead">
            <strong>In Simple Terms:</strong> Standard AI chatbots write code blindly—like handing you an essay on paper without ever checking if it compiles or crashes.{' '}
            <strong>AutoSWE Sandbox</strong> works like a real human software engineer sitting at a workstation: it reads your problem or buggy repository, writes C++20 code, runs it inside a locked test room (Docker), reads its own compiler or crash errors, and <strong>self-heals its own mistakes automatically</strong> until the output is 100% verified.
          </p>

          <div className="compare-grid">
            <div className="compare-box bad">
              <div className="compare-title compare-bad-text">
                ❌ Standard AI Chatbot (Blind Generation)
              </div>
              <div className="compare-flow">
                You ask a question ➔ AI guesses code in one shot ➔ You copy &amp; paste it into your compiler ➔ <strong>Code crashes with Overflow or Segfault</strong> ➔ You have to manually copy errors back and forth.
              </div>
            </div>

            <div className="compare-box good">
              <div className="compare-title compare-good-text">
                ✔ AutoSWE Autonomous Agent (Closed-Loop Verification)
              </div>
              <div className="compare-flow">
                You give problem + test case ➔ Agent writes C++20 code ➔ Compiles &amp; runs in Docker Sandbox ➔ <strong>Catches its own compiler/runtime bugs</strong> ➔ Fixes code automatically ➔ Delivers verified passing solution.
              </div>
            </div>
          </div>
        </section>

        {/* 2. INTERACTIVE LIVE DATA-FLOW & SSE EVENT DIAGRAM */}
        <section className="section-card">
          <div className="section-header-row">
            <div>
              <div className="section-title">
                📡 Live Event &amp; Data-Flow Diagram (Input ➔ Processing ➔ Output)
              </div>
              <div className="section-sub">
                Click any card or press <strong>Simulate Self-Healing Flow</strong> to watch how a request travels across ports :5173, :3001, and :8085.
              </div>
            </div>
            <div className="sim-controls">
              <button className="sim-btn" onClick={startSimulation}>
                {isSimulating ? `⏳ Simulating Step ${activeStep}/6...` : '▶ Simulate Bug & Self-Heal Flow'}
              </button>
              {activeStep > 0 && (
                <button className="sim-btn-secondary" onClick={resetSimulation}>
                  Reset View
                </button>
              )}
            </div>
          </div>

          {/* High-Level Service Pipe */}
          {/* Interactive SVG Architecture & Self-Healing Data-Flow Diagram */}
          <div className="arch-diagram-wrapper">
            <svg
              viewBox="0 0 1080 310"
              className="arch-svg"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <marker id="arrowGold" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#f9dc8c" />
                </marker>
                <marker id="arrowPurple" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#c792ea" />
                </marker>
                <marker id="arrowRed" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#f85149" />
                </marker>
                <marker id="arrowGreen" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#25d366" />
                </marker>
              </defs>

              {/* ================= CONNECTING ARROWS ================= */}
              {/* 1. React IDE -> Orchestrator (POST /api/agent/stream) */}
              <line
                x1="230" y1="68" x2="318" y2="68"
                className={`svg-flow-line gold-line ${activeStep === 1 ? 'line-pulse' : ''}`}
                markerEnd="url(#arrowGold)"
              />
              <text x="274" y="56" className="svg-edge-label gold-text">1. POST Prompt</text>
              <text x="274" y="84" className="svg-edge-sub">stdin + expected</text>

              {/* 2. Orchestrator <-> LLM Brain (ReAct & Tool Calls) */}
              <line
                x1="540" y1="58" x2="628" y2="58"
                className={`svg-flow-line gold-line ${activeStep === 2 || activeStep === 5 ? 'line-pulse' : ''}`}
                markerEnd="url(#arrowGold)"
              />
              <line
                x1="628" y1="80" x2="540" y2="80"
                className={`svg-flow-line purple-line ${activeStep === 3 ? 'line-pulse' : ''}`}
                markerEnd="url(#arrowPurple)"
              />
              <text x="584" y="47" className="svg-edge-label gold-text">2. 21s Rate Guard</text>
              <text x="584" y="96" className="svg-edge-label purple-text">3. JSON Tool Call</text>

              {/* 3. LLM / Orchestrator -> Docker Sandbox (HTTP Execute) */}
              <line
                x1="825" y1="68" x2="888" y2="68"
                className={`svg-flow-line purple-line ${activeStep === 3 || activeStep === 4 ? 'line-pulse' : ''}`}
                markerEnd="url(#arrowPurple)"
              />
              <text x="856" y="55" className="svg-edge-label purple-text">HTTP POST</text>
              <text x="856" y="84" className="svg-edge-sub">C++20 Code</text>

              {/* 4. Docker Sandbox -> Decision Diamond */}
              <line
                x1="975" y1="115" x2="975" y2="165"
                className={`svg-flow-line gold-line ${activeStep === 4 || activeStep === 6 ? 'line-pulse' : ''}`}
                markerEnd="url(#arrowGold)"
              />

              {/* 5. FAIL LOOP (Red): Decision -> Orchestrator/Brain (Self-Heal) */}
              <path
                d="M 910 200 L 430 200 L 430 120"
                fill="none"
                className={`svg-flow-line red-line ${activeStep === 4 || activeStep === 5 ? 'line-pulse' : ''}`}
                markerEnd="url(#arrowRed)"
              />
              <rect x="535" y="182" width="310" height="34" rx="6" fill="#140c0c" stroke="#f85149" strokeWidth="1" />
              <text x="690" y="197" className="svg-edge-label red-text">
                ❌ 4 &amp; 5. FAIL (Overflow / Segfault / Compile Error)
              </text>
              <text x="690" y="210" className="svg-edge-sub">
                Loops stderr &amp; exit_code back for Iteration 2..5 Self-Heal
              </text>

              {/* 6. PASS PATH (Green): Decision -> React IDE Client (Verified Output) */}
              <path
                d="M 975 235 L 975 278 L 125 278 L 125 120"
                fill="none"
                className={`svg-flow-line green-line ${activeStep === 6 ? 'line-pulse' : ''}`}
                markerEnd="url(#arrowGreen)"
              />
              <rect x="330" y="259" width="420" height="34" rx="6" fill="#0a170e" stroke="#25d366" strokeWidth="1" />
              <text x="540" y="274" className="svg-edge-label green-text">
                ✔ 6. PASS (ACCEPTED) ──► Live SSE Stream to Browser (:5173)
              </text>
              <text x="540" y="287" className="svg-edge-sub">
                Emits FINAL_ANSWER + Red/Green Diff Tabs + Saves to SQLite Run History
              </text>

              {/* ================= SERVICE NODES ================= */}
              {/* Node 1: React IDE Client */}
              <g
                className={`svg-node ${activeStep === 1 || activeStep === 6 ? 'node-highlight-gold' : ''}`}
                onClick={() => { setIsSimulating(false); setActiveStep(1); }}
              >
                <rect x="20" y="25" width="210" height="88" rx="10" className="svg-box" />
                <text x="125" y="48" className="svg-node-tag">LAYER 4 • CLIENT (:5173)</text>
                <text x="125" y="69" className="svg-node-title">🖥️ React 19 Telemetry IDE</text>
                <text x="125" y="88" className="svg-node-sub">Spec Input • Trace • Diff View</text>
                <text x="125" y="103" className="svg-node-sub">SQLite History Replay</text>
              </g>

              {/* Node 2: Node.js Orchestrator */}
              <g
                className={`svg-node ${activeStep === 2 || activeStep === 5 ? 'node-highlight-gold' : ''}`}
                onClick={() => { setIsSimulating(false); setActiveStep(2); }}
              >
                <rect x="320" y="25" width="220" height="88" rx="10" className="svg-box" />
                <text x="430" y="48" className="svg-node-tag">LAYER 2 • SERVER (:3001)</text>
                <text x="430" y="69" className="svg-node-title">🔄 Node.js Orchestrator</text>
                <text x="430" y="88" className="svg-node-sub">ReAct Loop (MAX_ITER = 5)</text>
                <text x="430" y="103" className="svg-node-sub">📁 ./repo Tools (read/write)</text>
              </g>

              {/* Node 3: LLM Brain */}
              <g
                className={`svg-node ${activeStep === 3 || activeStep === 5 ? 'node-highlight-purple' : ''}`}
                onClick={() => { setIsSimulating(false); setActiveStep(3); }}
              >
                <rect x="630" y="25" width="195" height="88" rx="10" className="svg-box" />
                <text x="727" y="48" className="svg-node-tag">LAYER 1 • AI BRAIN</text>
                <text x="727" y="69" className="svg-node-title">🧠 Gemini 2.5 / Qwen</text>
                <text x="727" y="88" className="svg-node-sub">Deterministic (temp: 0.1)</text>
                <text x="727" y="103" className="svg-node-sub">Strict JSON Schema Tools</text>
              </g>

              {/* Node 4: Docker C++20 Sandbox */}
              <g
                className={`svg-node ${activeStep === 4 ? 'node-highlight-red' : ''}`}
                onClick={() => { setIsSimulating(false); setActiveStep(4); }}
              >
                <rect x="890" y="25" width="170" height="88" rx="10" className="svg-box" />
                <text x="975" y="48" className="svg-node-tag">LAYER 3 • DOCKER (:8085)</text>
                <text x="975" y="69" className="svg-node-title">🛡️ C++20 Sandbox</text>
                <text x="975" y="88" className="svg-node-sub">g++ -std=c++20 -O2</text>
                <text x="975" y="103" className="svg-node-sub">256MB Cap • 2s Timeout</text>
              </g>

              {/* Decision Node: Pass or Fail? */}
              <g
                className={`svg-node ${activeStep === 4 || activeStep === 6 ? 'node-highlight-gold' : ''}`}
                onClick={() => { setIsSimulating(false); setActiveStep(6); }}
              >
                <rect x="910" y="168" width="130" height="64" rx="32" className="svg-decision-box" />
                <text x="975" y="196" className="svg-node-title" style={{ fontSize: '12.5px' }}>
                  Tests Passed?
                </text>
                <text x="975" y="214" className="svg-node-sub">
                  stdout == expected
                </text>
              </g>
            </svg>
          </div>

          {/* 6-Stage Step-by-Step Event Cards */}
          <div className="flow-grid">
            {FLOW_STEPS.map((item) => {
              const isHighlighted = activeStep === item.id;
              const isDimmed = activeStep > 0 && activeStep !== item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    setIsSimulating(false);
                    setActiveStep(item.id === activeStep ? 0 : item.id);
                  }}
                  className={`flow-card ${isHighlighted ? 'active-step' : ''} ${isDimmed ? 'dimmed-step' : ''}`}
                >
                  <div className="flow-meta-top">
                    <span className="flow-stage-label">{item.stage}</span>
                    <span
                      className="flow-event-badge"
                      style={{ color: item.color, borderColor: item.color }}
                    >
                      {item.eventTag}
                    </span>
                  </div>
                  <h4>{item.title}</h4>
                  <div className="flow-simple">
                    <strong>Plain English:</strong> {item.simple}
                  </div>
                  <div className="flow-tech">
                    <strong>Under the Hood:</strong> {item.technical}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 3. REAL WALKTHROUGH: HOW THE AGENT SELF-HEALS A BUG */}
        <section className="section-card">
          <div className="section-header-row">
            <div>
              <div className="section-title">
                🔍 Real Example: Watching Iteration 1 Fail &amp; Iteration 2 Self-Heal
              </div>
              <div className="section-sub">
                What happens when we ask the agent to sum huge numbers (<code>2000000000 + 2000000000 = 4000000000</code>) that overflow standard 32-bit memory?
              </div>
            </div>
          </div>

          <div className="walkthrough-grid">
            <div className="code-compare-card">
              <div className="code-compare-header fail-header">
                <span>❌ Iteration 1 — 32-Bit Overflow Failure</span>
                <span>Status: WRONG_ANSWER (14ms)</span>
              </div>
              <pre className="code-pre">
{`#include <iostream>
int main() {
`}
                <span className="diff-del">-   int a, b; // Max value is only 2,147,483,647!</span>
{`    std::cin >> a >> b;
    std::cout << (a + b) << "\\n";
    return 0;
}

// Sandbox stdout: -294967296 (Wrapped around!)
// Sandbox stderr: signed integer overflow cannot be represented in type 'int'`}
              </pre>
            </div>

            <div className="code-compare-card">
              <div className="code-compare-header pass-header">
                <span>✔ Iteration 2 — Autonomous 64-Bit Fix (Diff vs Iter 1)</span>
                <span>Status: ACCEPTED (12ms)</span>
              </div>
              <pre className="code-pre">
{`#include <iostream>
int main() {
`}
                <span className="diff-add">+   long long a, b; // Upgraded to 64-bit (~9.22 × 10^18)</span>
{`    std::cin >> a >> b;
    std::cout << (a + b) << "\\n";
    return 0;
}

// Sandbox stdout: 4000000000 (Matches Expected Output!)
// Orchestrator: Passed == true -> Early exit & emit FINAL_ANSWER`}
              </pre>
            </div>
          </div>
        </section>

        {/* 4. THE 4-LAYER SYSTEM ARCHITECTURE */}
        <section className="section-card">
          <div className="section-header-row">
            <div>
              <div className="section-title">
                🏗️ The 4-Layer System Architecture (Beginner + Deep Tech View)
              </div>
              <div className="section-sub">
                Every component is decoupled so the AI Brain, Node.js Orchestrator, Docker Sandbox, and React IDE communicate through clean contracts.
              </div>
            </div>
          </div>

          <div className="arch-grid">
            {ARCHITECTURE_LAYERS.map((item, idx) => (
              <div key={idx} className="arch-card">
                <div className="arch-top">
                  <span className="arch-badge">{item.layer}</span>
                  <span className="arch-title">
                    {item.icon} {item.name}
                  </span>
                </div>
                <div className="plain-english-box">
                  <strong>💡 In Plain English:</strong> {item.simple}
                </div>
                <div className="specs-heading">⚙️ Deep Engineering Specs:</div>
                <ul className="specs-list">
                  {item.specs.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* 5. AUTONOMOUS TOOLSET & PRODUCTION GUARDRAILS */}
        <section className="section-card">
          <div className="section-header-row">
            <div>
              <div className="section-title">🛠️ Agent Toolset &amp; Production Safety Guardrails</div>
              <div className="section-sub">
                How the agent interacts with disk files in <code>./repo</code> while staying protected against infinite loops and API rate limits.
              </div>
            </div>
          </div>

          <div className="tools-guard-grid">
            <div>
              <h4 className="sub-col-heading">🔧 4 Autonomous Tool Schemas (agent.js)</h4>
              <div className="mini-item">
                <div className="mini-item-title">1. list_files()</div>
                <div className="mini-item-desc">
                  Scans the local <code>./repo</code> workspace directory so the agent can discover existing C++ source and header files.
                </div>
              </div>
              <div className="mini-item">
                <div className="mini-item-title">2. read_file(&#123; filepath &#125;)</div>
                <div className="mini-item-desc">
                  Reads the exact code inside files like <code>./repo/discount.cpp</code> to diagnose logic bugs before touching disk.
                </div>
              </div>
              <div className="mini-item">
                <div className="mini-item-title">3. write_file(&#123; filepath, content &#125;)</div>
                <div className="mini-item-desc">
                  Applies verified C++ patches directly to disk inside <code>./repo</code>.
                </div>
              </div>
              <div className="mini-item">
                <div className="mini-item-title">
                  4. execute_cpp_code(&#123; reasoning, cpp_source_code, stdin_input, expected_output &#125;)
                </div>
                <div className="mini-item-desc">
                  Sends complete C++20 code and test inputs to the Docker container and returns pass/fail diagnostics.
                </div>
              </div>
            </div>

            <div>
              <h4 className="sub-col-heading">🛡️ 4 Production Engineering Guardrails</h4>
              <div className="mini-item">
                <div className="mini-item-title">⏳ 21-Second (5 RPM) Persistent Rate Limiter</div>
                <div className="mini-item-desc">
                  Free-tier cloud LLMs reject bursts above 5 requests/minute (HTTP 429). Our promise-chain queue spaces LLM calls by <code>21,000ms</code> with <code>maxRetries: 0</code>.
                </div>
              </div>
              <div className="mini-item">
                <div className="mini-item-title">🛑 Hard Loop Cutoff (MAX_ITERATIONS = 5)</div>
                <div className="mini-item-desc">
                  Prevents runaway token usage if an algorithm remains unsolvable after 5 self-healing attempts.
                </div>
              </div>
              <div className="mini-item">
                <div className="mini-item-title">✂️ 4,000-Character Context Window Shield</div>
                <div className="mini-item-desc">
                  If buggy C++ code enters an infinite print loop, <code>formatSandboxFeedback()</code> slices <code>stdout</code> and <code>stderr</code> to 4,000 chars so the LLM context never overflows.
                </div>
              </div>
              <div className="mini-item">
                <div className="mini-item-title">🔌 15s SSE Heartbeat &amp; Disconnect Cleanup</div>
                <div className="mini-item-desc">
                  Keeps slow local LLM streams alive with 15-second socket heartbeats and cleanly halts streaming if you close the tab or click Stop Agent.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 6. BEGINNER-FRIENDLY MINI GLOSSARY */}
        <section className="section-card">
          <div className="section-header-row">
            <div>
              <div className="section-title">📖 Plain-English Glossary (Zero Jargon Left Behind)</div>
              <div className="section-sub">
                New to systems programming or AI agents? Here is what every technical term in this workspace means.
              </div>
            </div>
            {onNavigateWorkspace && (
              <button className="sim-btn" onClick={onNavigateWorkspace}>
                Back to Workspace IDE ▶
              </button>
            )}
          </div>

          <div className="glossary-grid">
            {GLOSSARY.map((g, i) => (
              <div key={i} className="mini-item no-margin">
                <div className="mini-item-title">{g.term}</div>
                <div className="mini-item-desc">{g.desc}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}