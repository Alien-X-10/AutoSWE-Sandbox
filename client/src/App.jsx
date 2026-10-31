import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import History from './History.jsx';
import About from './assets/About';
// import Auth from './Auth.jsx';
import Auth from './Auth';



const INITIAL_CODE = `#include <bits/stdc++.h>
using namespace std;

int main() {
  ios::sync_with_stdio(false);
  cin.tie(nullptr);  
  int n;
  if (!(cin >> n)) return 0;
  long long maxSum = LLONG_MIN;
  long long currentSum = 0;
    for (int i = 0; i < n; i++) {
        long long x;
        cin >> x;
        currentSum = max(x, currentSum + x);
        maxSum = max(maxSum, currentSum);
    }
    cout << maxSum << "\\n";
    return 0;
}`;

const INITIAL_EVENTS = [
  {
    timestamp: '13:18:04',
    title: 'Analyzed problem',
    detail: "Identified this as maximum subarray sum.\nSelected Kadane's algorithm.",
    done: false
  },
  {
    timestamp: '13:18:07',
    title: 'Generated solution',
    detail: "Created C++20 implementation using Kadane's algorithm with O(n) time and O(1) space.",
    done: false
  },
  {
    timestamp: '13:18:09',
    title: 'Compiled with g++',
    detail: 'Compilation successful (no errors).',
    done: false
  },
  {
    timestamp: '13:18:09',
    title: 'Executed test case',
    detail: 'Ran with provided input. Output matches expected result.',
    done: false
  },
  {
    timestamp: '13:18:09',
    title: 'Task completed',
    detail: 'Solution passed all test cases.',
    done: true
  }
];

const PRESETS = [
  {
    id: 'custom',
    title: 'Custom Problem',
    subtitle: '',
    // prompt: 'Write a C++20 program that reads N integers, and prints the maximum contiguous subarray sum.',
    // stdin: '5\n1 2 -3 4 5',
    // expected: '9'
  },
  {
    id: 'repo',
    title: 'Fix Repo Bug',
    subtitle: '(.cpp)',
    prompt: 'Use list_files and read_file to inspect ./repo/discount.cpp. Fix the discount bug on disk using write_file, then verify with execute_cpp_code.',
    stdin: '100 20',
    expected: '80'
  },
  {
    id: 'overflow',
    title: 'Integer Overflow',
    subtitle: '(Self-Host)',
    prompt: 'Fix the 32-bit integer overflow bug in maximum subarray calculation by upgrading accumulators to 64-bit long long and verify with execute_cpp_code.',
    stdin: '5\n-2 1000000000 -3 1000000000 -1',
    expected: '1999999997'
  },
  {
    id: 'segfault',
    title: 'Segfault / Bounds',
    subtitle: '(Self-Host)',
    prompt: 'Diagnose the out-of-bounds vector access causing SIGSEGV (Exit Code 139), patch the loop boundary, and verify inside the C++20 sandbox.',
    stdin: '3\n10 20 30',
    expected: '60'
  },
  {
    id: 'kadane',
    title: "Kadane's Algorithm",
    subtitle: '(Basic)',
    prompt: 'Write a C++20 program that reads N integers, and prints the maximum contiguous subarray sum.',
    stdin: '5\n1 2 -3 4 5',
    expected: '9'
  }
];


// Syntax Highlighter matching the exact colors of the reference screenshot
function highlightCppLine(line) {
  const escaped = line
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // if (/^\s*#include/.test(line)) {
  //   return escaped.replace(
  //     /(#include)(\s+)([&lt;"].*?[&gt;"])/,
  //     '<span class="tok-macro">$1</span>$2<span class="tok-header">$3</span>'
  //   );
  // }

  if (/^\s*#include/.test(line)) {
    return escaped.replace(
      /(#include)(\s+)(&lt;.*?&gt;|".*?")/,
      '<span class="tok-macro">$1</span>$2<span class="tok-header">$3</span>'
    );
  }

  return escaped
    .replace(/(".*?")/g, '<span class="tok-string">$1</span>')
    .replace(
      /\b(using|namespace|int|long|for|if|return|false|nullptr)\b/g,
      '<span class="tok-kw">$1</span>'
    )
    .replace(/\b(std|ios|cin|cout|max|LLONG_MIN)\b/g, '<span class="tok-std">$1</span>')
    .replace(/\b(main|sync_with_stdio|tie)\b/g, '<span class="tok-fn">$1</span>')
    .replace(/\b(\d+)\b/g, '<span class="tok-num">$1</span>');
}

export default function App() {
  const [currentPage, setCurrentPage] = useState(
    window.location.hash || '#workspace'
  );

  //   const [isAuthenticated, setIsAuthenticated] = useState(
  //     Boolean(localStorage.getItem('autoswe_user'))
  // );

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentPage(window.location.hash || '#workspace');
    };

    window.addEventListener('hashchange', handleHashChange);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch(
          'http://localhost:3001/api/auth/me',
          {
            credentials: 'include',
          }
        );

        setIsAuthenticated(response.ok);
      } catch (error) {
        console.error('Session check failed:', error);
        setIsAuthenticated(false);
      } finally {
        setAuthChecking(false);
      }
    };

    checkSession();
  }, []);

  const [activePreset, setActivePreset] = useState('custom');
  const [description, setDescription] = useState(PRESETS[0].prompt);
  const [stdinInput, setStdinInput] = useState(PRESETS[0].stdin);
  const [expectedOutput, setExpectedOutput] = useState(PRESETS[0].expected);

  // const [running, setRunning] = useState(false);
  // const [traceItems, setTraceItems] = useState(INITIAL_EVENTS);
  // const [generatedCode, setGeneratedCode] = useState(INITIAL_CODE);
  // const [codeVersions, setCodeVersions] = useState({ 1: INITIAL_CODE });
  // const [viewingIteration, setViewingIteration] = useState(1);
  // const [showDiff, setShowDiff] = useState(false);

  // const [activeTab, setActiveTab] = useState('terminal');
  // const [sandboxSummary, setSandboxSummary] = useState({
  //   passed: true,
  //   statusText: 'Output matches expected result.',
  //   compileTime: '0.18s',
  //   runTime: '0.01s',
  //   memory: '3.2 MB',
  //   stdin: '5\n1 2 -3 4 5',
  //   expected: '9',
  //   actual: '9',
  //   stderr: ''
  // });
  // const [rawOutput, setRawOutput] = useState({
  //   passed: true,
  //   status: 'ACCEPTED',
  //   exit_code: 0,
  //   execution_time_ms: 10,
  //   stdout: '9\n'
  // });

  const [running, setRunning] = useState(false);
  const [traceItems, setTraceItems] = useState([]);
  const [generatedCode, setGeneratedCode] = useState('');
  const [codeVersions, setCodeVersions] = useState({});
  const [viewingIteration, setViewingIteration] = useState(null);
  const [showDiff, setShowDiff] = useState(false);

  const [midTab, setMidTab] = useState('spec'); // 'spec' | 'trace'
  const [activeTab, setActiveTab] = useState('terminal');

  const [sandboxSummary, setSandboxSummary] = useState(null);
  const [rawOutput, setRawOutput] = useState(null);


  const [recentRuns, setRecentRuns] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');


  const esRef = useRef(null);
  const fileInputRef = useRef(null);
  const traceEndRef = useRef(null);

  useEffect(() => {
    traceEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [traceItems]);

  useEffect(() => {
    const fetchRecentRuns = async () => {
      try {
        setHistoryLoading(true);
        setHistoryError('');

        // const response = await fetch('http://localhost:3001/api/agent/runs');
        const response = await fetch(
          'http://localhost:3001/api/agent/runs',
          {
            credentials: 'include',
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        setRecentRuns(data.runs || []);
      } catch (error) {
        console.error('Failed to load recent runs:', error);
        setHistoryError('Could not load saved runs.');
      } finally {
        setHistoryLoading(false);
      }
    };

    fetchRecentRuns();
  }, []);

  const handlePresetSelect = (preset) => {
    setActivePreset(preset.id);
    setDescription(preset.prompt);
    setStdinInput(preset.stdin);
    setExpectedOutput(preset.expected);
    setMidTab('spec'); // <-- Switches back to Problem Specification when picking a preset
  };

  const clearWorkspace = () => {
    setDescription('');
    setStdinInput('');
    setExpectedOutput('');
    setTraceItems([]);
    setGeneratedCode('');
    setCodeVersions({});
    setViewingIteration(null);
    setShowDiff(false);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const code = ev.target.result;
      setActivePreset('custom');
      setDescription(
        `Save the following code to ./repo/${file.name} using write_file, fix any bugs, and verify it using execute_cpp_code:\n\n${code}`
      );
      setGeneratedCode(code);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const stopAgent = () => {
    esRef.current?.abort?.();
    setRunning(false);
    const now = new Date().toLocaleTimeString('en-US', { hour12: false });
    setTraceItems((prev) => [
      ...prev,
      { timestamp: now, title: 'Execution stopped', detail: 'Stopped manually by user.', done: false }
    ]);
  };

  const startAgent = async () => {
    if (running) return;
    setMidTab('trace');
    setRunning(true);
    setTraceItems([]);
    setGeneratedCode('');
    setCodeVersions({});
    setViewingIteration(null);
    setShowDiff(false);

    const fullPrompt = `${description}\nTest Input: ${stdinInput}\nExpected Output: ${expectedOutput}`;
    const controller = new AbortController();
    esRef.current = controller;

    const handleEvent = (data) => {
      const now = new Date().toLocaleTimeString('en-US', { hour12: false });

      if (data.type === 'ITERATION_START') {
        setTraceItems((prev) => [
          ...prev,
          {
            timestamp: now,
            title: `Iteration ${data.iteration} started`,
            detail: `Running step ${data.iteration}/${data.maxIterations || 5}...`,
            done: false
          }
        ]);
      } else if (data.type === 'RATE_LIMIT_WAIT') {
        setTraceItems((prev) => [
          ...prev,
          {
            timestamp: now,
            title: 'Rate limit cooldown',
            detail: data.message || 'Waiting for Gemini API quota window...',
            done: false
          }
        ]);
      } else if (data.type === 'THOUGHT') {
        setTraceItems((prev) => [
          ...prev,
          {
            timestamp: now,
            title: 'Analyzed problem',
            detail: data.content,
            done: false
          }
        ]);
      } else if (data.type === 'TOOL_CALL') {
        if (data.code) {
          setGeneratedCode(data.code);
          setViewingIteration(data.iteration);
          setCodeVersions((prev) => ({ ...prev, [data.iteration]: data.code }));
        }
        setTraceItems((prev) => [
          ...prev,
          {
            timestamp: now,
            title: data.code ? `Generated solution (Iter ${data.iteration})` : `Tool call (Iter ${data.iteration})`,
            detail: data.reasoning || 'Dispatched tool action to workspace.',
            done: false
          }
        ]);
      } else if (data.type === 'SANDBOX_RESULT') {
        const r = data.result || {};
        const passed = Boolean(r.passed);
        setRawOutput(r);
        setSandboxSummary({
          passed,
          statusText: passed
            ? 'Output matches expected result.'
            : `Status: ${r.status || 'FAILED'}`,
          compileTime: '0.18s',
          runTime: `${((r.execution_time_ms || 10) / 1000).toFixed(2)}s`,
          memory: '3.2 MB',
          stdin: stdinInput,
          expected: expectedOutput,
          actual: (r.stdout || '').trim(),
          stderr: r.stderr || ''
        });
        setTraceItems((prev) => [
          ...prev,
          {
            timestamp: now,
            title: `Executed test case (${r.status || 'DONE'})`,
            detail: passed
              ? `Ran in ${r.execution_time_ms || 0}ms. Output matches expected result.`
              : `Sandbox reported ${r.status || 'error'}. Self-healing...`,
            done: false
          },
          ...(passed
            ? [
              {
                timestamp: now,
                title: 'Task completed',
                detail: 'Solution passed all test cases.',
                done: true
              }
            ]
            : [])
        ]);
        if (passed) {
          const presetObj = PRESETS.find((p) => p.id === activePreset);
          setRecentRuns((prev) => [
            {
              name: presetObj ? presetObj.title : 'Custom problem',
              date: `Oct 26, 2025  ${now.slice(0, 5)}`,
              status: 'success'
            },
            ...prev.slice(0, 2)
          ]);
          setRunning(false);
        }

        //  } else if (data.type === 'FINAL_ANSWER') {

      } else if (data.type === 'FINAL_ANSWER') {
        const isSolved = Boolean(data.solved);
        setTraceItems((prev) => [
          ...prev,
          {
            timestamp: now,
            title: isSolved ? 'Task completed' : 'Agent loop finished (Unverified)',
            detail: isSolved
              ? 'Solution passed all test cases.'
              : 'Agent stopped without passing sandbox verification.',
            done: true,
            failed: !isSolved
          }
        ]);
        const presetObj = PRESETS.find((p) => p.id === activePreset);
        setRecentRuns((prev) => [
          {
            name: presetObj ? presetObj.title : 'Custom problem',
            date: `Oct 26, 2025  ${now.slice(0, 5)}`,
            status: isSolved ? 'success' : 'failed'
          },
          ...prev.slice(0, 2)
        ]);
        setRunning(false);
        es.close();
      } else if (data.type === 'MAX_ITERATIONS_REACHED') {
        setTraceItems((prev) => [
          ...prev,
          {
            timestamp: now,
            title: 'Max iterations reached',
            detail: data.message || 'Reached maximum iterations without passing verification.',
            done: true,
            failed: true
          }
        ]);
        setRunning(false);
        // es.close();

        const isSolved = Boolean(data.solved);
        setTraceItems((prev) => [
          ...prev,
          {
            timestamp: now,
            title: isSolved ? 'Task completed' : 'Agent loop finished (Unverified)',
            detail: isSolved
              ? 'Solution passed all test cases.'
              : 'Agent stopped without passing sandbox verification.',
            done: true,
            failed: !isSolved
          }
        ]);
        const presetObj = PRESETS.find((p) => p.id === activePreset);
        setRecentRuns((prev) => [
          {
            name: presetObj ? presetObj.title : 'Custom problem',
            date: `Oct 26, 2025  ${now.slice(0, 5)}`,
            status: isSolved ? 'success' : 'failed'
          },
          ...prev.slice(0, 2)
        ]);
        setRunning(false);
        es.close();
      } else if (data.type === 'MAX_ITERATIONS_REACHED') {
        setTraceItems((prev) => [
          ...prev,
          {
            timestamp: now,
            title: 'Max iterations reached',
            detail: data.message || 'Reached maximum iterations without passing verification.',
            done: true,
            failed: true
          }
        ]);
        setRunning(false);
        es.close();
        const solved = data.solved === true;

        setTraceItems((prev) => [
          ...prev,
          {
            timestamp: now,
            title: solved ? 'Task completed' : 'Task failed',
            detail: solved
              ? 'Solution passed all test cases.'
              : 'Agent finished without successfully passing all test cases.',
            done: solved
          }
        ]);

        const presetObj = PRESETS.find((p) => p.id === activePreset);

        setRecentRuns((prev) => [
          {
            name: presetObj ? presetObj.title : 'Custom problem',
            date: `Oct 26, 2025  ${now.slice(0, 5)}`,
            status: solved ? 'success' : 'failed'
          },
          ...prev.slice(0, 2)
        ]);

        setRunning(false);

      } else if (data.type === 'ERROR') {
        setTraceItems((prev) => [
          ...prev,
          { timestamp: now, title: 'Error', detail: data.message, done: false }
        ]);
        setRunning(false);
      } else if (data.type === 'STREAM_COMPLETE') {
        setRunning(false);
      }
    };

    // } else if (data.type === 'FINAL_ANSWER') {
    //   setTraceItems((prev) => [
    //     ...prev,
    //     {
    //       timestamp: now,
    //       title: 'Task completed',
    //       detail: 'Solution passed all test cases.',
    //       done: true
    //     }
    //   ]);
    //   const presetObj = PRESETS.find((p) => p.id === activePreset);
    //   setRecentRuns((prev) => [
    //     {
    //       name: presetObj ? presetObj.title : 'Custom problem',
    //       date: `Oct 26, 2025  ${now.slice(0, 5)}`,
    //       status: data.solved !== false ? 'success' : 'failed'
    //     },
    //     ...prev.slice(0, 2)
    //   ]);
    //   setRunning(false);
    try {
      const response = await fetch('http://localhost:3001/api/agent/stream', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: fullPrompt,
          problemPrompt: fullPrompt,
          stdin: stdinInput,
          expectedOutput: expectedOutput
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const block of parts) {
          const dataLine = block
            .split('\n')
            .find((line) => line.startsWith('data:'));
          if (dataLine) {
            const jsonStr = dataLine.replace(/^data:\s*/, '').trim();
            if (jsonStr) {
              handleEvent(JSON.parse(jsonStr));
            }
          }
        }
      }
      setRunning(false);
    } catch (err) {
      if (err.name !== 'AbortError') {
        const now = new Date().toLocaleTimeString('en-US', { hour12: false });
        setTraceItems((prev) => [
          ...prev,
          {
            timestamp: now,
            title: 'Connection Error',
            detail: `Failed to reach http://localhost:3001/api/agent/stream (${err.message})`,
            done: false
          }
        ]);
      }
      setRunning(false);
    }
  };

  if (authChecking && currentPage !== '#about') {
    return <div>Checking your session...</div>;
  }

  if (!isAuthenticated && currentPage !== '#about') {
    return (
      <Auth
        onAuthSuccess={() => {
          setIsAuthenticated(true);
          window.location.hash = '#workspace';
        }}
        onNavigateAbout={() => {
          window.location.hash = '#about';
        }}
      />
    );
  }

  return (
    <div className="autoswe-shell">
      {/* Top Navbar */}
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand">
            <svg width="24" height="22" viewBox="0 0 24 22" fill="none">
              <path d="M2 20L10.5 2H15L6.5 20H2Z" fill="url(#goldGrad)" />
              <path d="M10 20L17 6H21.5L14.5 20H10Z" fill="url(#goldGrad)" opacity="0.85" />
              <defs>
                <linearGradient id="goldGrad" x1="0" y1="0" x2="24" y2="22" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#FFE082" />
                  <stop offset="1" stopColor="#D49B27" />
                </linearGradient>
              </defs>
            </svg>
            <span className="brand-text">AutoSWE Sandbox</span>
          </div>

          <nav className="topnav">
            {/* <a href="#workspace" className="topnav-link active">Workspace</a> */}
            <a
              href="#workspace"
              className={`topnav-link ${currentPage === '#workspace' ? 'active' : ''}`}
            >
              Workspace
            </a>
            {/* <a href="#problems" className="topnav-link">Problems</a> */}
            <a
              href="#history"
              className={`topnav-link ${currentPage === '#history' ? 'active' : ''}`}
            >
              History
            </a>
            {/* <a href="#about" className="topnav-link">About</a> */}
            <a
              href="#about"
              className={`topnav-link ${currentPage === '#about' ? 'active' : ''}`}
            >
              About
            </a>
          </nav>
        </div>

        <div className="topbar-right">
          
          <button className="gear-btn" title="Settings">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          {/* <button
            className={`gold-run-btn ${running ? 'is-running' : ''}`}
            onClick={running ? stopAgent : startAgent}
          >
            {running ? 'Stop Agent ■' : 'Run Agent ▶'}
          </button> */}
          <button
            className="gold-run-btn"
            // onClick={() => {
            //   localStorage.removeItem('autoswe_user');
            //   setIsAuthenticated(false);
            //   window.location.hash = '#workspace';
            // }}

            onClick={async () => {
              try {
                const response = await fetch(
                  'http://localhost:3001/api/auth/logout',
                  {
                    method: 'POST',
                    credentials: 'include',
                  }
                );

                if (!response.ok) {
                  throw new Error('Logout failed');
                }

                setIsAuthenticated(false);
                window.location.hash = '#workspace';
              } catch (error) {
                console.error('Logout failed:', error);
                alert('Unable to log out. Please try again.');
              }
            }}
          >
            Log Out ⏻
          </button>
        </div>
      </header>

      {/* Main 3-Column Grid */}
      {/* <main className="main-grid"> */}
      {currentPage === '#history' ? (
        <History />
      ) : currentPage === '#about' ? (
        <About />
      ) : (
        <main className="main-grid">
          {/* LEFT SIDEBAR: Single unified tall card with Golden Waves at bottom */}
          <aside className="sidebar-card">
            <div className="sidebar-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E5B84B" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span>Workspace</span>
            </div>

            <div className="sidebar-section">
              <div className="section-label-row">
                <span className="section-label">Problem Presets</span>
                <button
                  className="plus-btn"
                  title="Upload .cpp / .h file"
                  onClick={() => fileInputRef.current?.click()}
                >
                  +
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".cpp,.cc,.h,.hpp"
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                />
              </div>

              <div className="preset-stack">
                {PRESETS.map((p) => {
                  const isActive = activePreset === p.id;
                  return (
                    <button
                      key={p.id}
                      className={`preset-btn ${isActive ? 'active' : ''}`}
                      onClick={() => handlePresetSelect(p)}
                    >
                      <div className="preset-icon-box">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="8" y1="13" x2="16" y2="13" />
                          <line x1="8" y1="17" x2="13" y2="17" />
                        </svg>
                      </div>
                      <div className="preset-text">
                        <div className="preset-title">{p.title}</div>
                        {p.subtitle && <div className="preset-sub">{p.subtitle}</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="sidebar-section recent-section">
              <div className="section-label-row">
                {/* <span className="section-label">Recent Runs</span> */}
              </div>
              {/* <div className="recent-stack">
                {recentRuns.map((item, i) => (
                  <div key={i} className="recent-row">
                    <span className={`recent-ring ${item.status}`} />
                    <div className="recent-info">
                      <div className="recent-name">{item.name}</div>
                      <div className="recent-time">{item.date}</div>
                    </div>
                  </div>
                ))}
              </div> */}
            </div>

            {/* BOTTOM-LEFT GOLDEN SILK WAVE ARTWORK (Matches Reference Image) */}
            <div className="gold-wave-artwork">
              <div className="gold-ambient-glow" />
              <svg viewBox="0 0 260 210" preserveAspectRatio="none" className="wave-svg">
                <defs>
                  <linearGradient id="ribbon1" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FFE58F" stopOpacity="0.95" />
                    <stop offset="50%" stopColor="#D89E2B" stopOpacity="0.65" />
                    <stop offset="100%" stopColor="#5C3D06" stopOpacity="0.1" />
                  </linearGradient>
                  <linearGradient id="ribbon2" x1="0%" y1="30%" x2="100%" y2="90%">
                    <stop offset="0%" stopColor="#F7C95C" stopOpacity="0.5" />
                    <stop offset="60%" stopColor="#B87D14" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#120E07" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="ribbonFill" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#E6A930" stopOpacity="0.28" />
                    <stop offset="50%" stopColor="#8C5D0B" stopOpacity="0.12" />
                    <stop offset="100%" stopColor="#0E0C08" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Soft glowing silk fills */}
                <path
                  d="M-20,25 C60,40 75,115 155,140 C210,158 240,185 280,210 L-20,210 Z"
                  fill="url(#ribbonFill)"
                />
                <path
                  d="M-20,85 C45,95 95,145 175,165 C225,178 250,195 280,215 L-20,215 Z"
                  fill="url(#ribbonFill)"
                />

                {/* Multiple sweeping golden silk filaments */}
                <path d="M-15,20 C55,35 70,110 155,138 C210,156 240,182 275,208" fill="none" stroke="url(#ribbon1)" strokeWidth="2.2" />
                <path d="M-15,32 C62,48 78,118 162,146 C215,163 242,188 275,210" fill="none" stroke="url(#ribbon2)" strokeWidth="1.4" />
                <path d="M-15,46 C68,64 85,126 170,154 C220,170 245,193 275,212" fill="none" stroke="url(#ribbon2)" strokeWidth="1.1" />
                <path d="M-15,65 C40,70 85,135 165,162 C215,179 245,196 275,212" fill="none" stroke="url(#ribbon1)" strokeWidth="1.8" />
                <path d="M-15,82 C35,88 82,148 158,172 C210,188 240,202 270,214" fill="none" stroke="url(#ribbon2)" strokeWidth="1.2" />
                <path d="M-15,115 C30,118 75,165 148,186 C195,199 225,206 265,215" fill="none" stroke="url(#ribbon1)" strokeWidth="1.6" />
                <path d="M-15,140 C25,144 65,180 135,196 C180,206 215,210 255,216" fill="none" stroke="url(#ribbon2)" strokeWidth="1" />

                {/* Golden sparkle particles */}
                <circle cx="42" cy="118" r="1.3" fill="#FFE082" opacity="0.8" />
                <circle cx="88" cy="146" r="1.6" fill="#FFE082" opacity="0.9" />
                <circle cx="124" cy="134" r="1.1" fill="#F6C453" opacity="0.7" />
                <circle cx="164" cy="172" r="1.5" fill="#FFE082" opacity="0.85" />
                <circle cx="65" cy="168" r="1.2" fill="#F6C453" opacity="0.6" />
                <circle cx="198" cy="186" r="1.4" fill="#FFE082" opacity="0.75" />
              </svg>
            </div>
          </aside>


          {/* MIDDLE COLUMN: Single Full-Height Card with Problem Spec & Agent Trace Tabs */}
          <section className="middle-col">
            <div className="gold-card mid-tabbed-card">
              {/* 2-Tab Header Bar */}
              <div className="mid-tabbar">
                <button
                  className={`mid-tab ${midTab === 'spec' ? 'active' : ''}`}
                  onClick={() => setMidTab('spec')}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="8" y1="13" x2="16" y2="13" />
                    <line x1="8" y1="17" x2="13" y2="17" />
                  </svg>
                  <span>Problem Specification</span>
                </button>

                <button
                  className={`mid-tab ${midTab === 'trace' ? 'active' : ''}`}
                  onClick={() => setMidTab('trace')}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="9" />
                    <polyline points="12 7 12 12 15 15" />
                  </svg>
                  <span>Agent Trace</span>
                  {traceItems.length > 0 && (
                    <span className="trace-count-badge">{traceItems.length}</span>
                  )}
                </button>
              </div>

              {/* Tab 1 Content: Problem Specification */}
              {midTab === 'spec' ? (
                <div className="spec-form">
                  <label className="field-label">Problem description</label>
                  <textarea
                    className="gold-input desc-box"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Type any C++20 problem, paste buggy code, or upload a .cpp file..."
                  />

                  <label className="field-label">Input (stdin)</label>
                  <textarea
                    className="gold-input stdin-box"
                    value={stdinInput}
                    onChange={(e) => setStdinInput(e.target.value)}
                    placeholder="Standard input test payload..."
                  />

                  <label className="field-label">Expected output</label>
                  <input
                    type="text"
                    className="gold-input expected-box"
                    value={expectedOutput}
                    onChange={(e) => setExpectedOutput(e.target.value)}
                    placeholder="Expected stdout result..."
                  />

                  <div className="spec-actions">
                    <button
                      className={`gold-run-btn wide ${running ? 'is-running' : ''}`}
                      onClick={running ? stopAgent : startAgent}
                    >
                      {running ? 'Stop Agent ■' : 'Run Agent ▶'}
                    </button>
                    <button className="dark-clear-btn" onClick={clearWorkspace}>
                      Clear
                    </button>
                  </div>
                </div>
              ) : (
                /* Tab 2 Content: Live Agent Trace */
                <div className="trace-scroll">
                  {traceItems.length === 0 && (
                    <div style={{ color: '#7c7569', fontSize: '13px', textAlign: 'center', marginTop: '60px' }}>
                      Click "Run Agent ▶" to stream live ReAct telemetry...
                    </div>
                  )}
                  {traceItems.map((item, idx) => {
                    if (item.done) {
                      return (
                        <div
                          key={idx}
                          className="trace-completed-banner"
                          style={
                            item.failed
                              ? { borderColor: '#78352d', background: 'rgba(43, 21, 18, 0.65)' }
                              : undefined
                          }
                        >
                          <div
                            className="completed-check"
                            style={
                              item.failed
                                ? { background: '#ff8378', color: '#1a0b09' }
                                : undefined
                            }
                          >
                            {item.failed ? '✕' : '✔'}
                          </div>
                          <span className="trace-time">{item.timestamp}</span>
                          <div className="completed-text">
                            <div
                              className="completed-title"
                              style={item.failed ? { color: '#ff8378' } : undefined}
                            >
                              {item.title}
                            </div>
                            <div className="completed-sub">{item.detail}</div>
                          </div>
                        </div>
                      );
                    }

                    {/* {traceItems.map((item, idx) => {
                    if (item.done) {
                      return (
                        <div key={idx} className="trace-completed-banner">
                          <div className="completed-check">✔</div>
                          <span className="trace-time">{item.timestamp}</span>
                          <div className="completed-text">
                            <div className="completed-title">{item.title}</div>
                            <div className="completed-sub">{item.detail}</div>
                          </div>
                        </div>
                      );
                    } */}
                    return (
                      <div key={idx} className="trace-row">
                        <div className="trace-rail">
                          <span className="trace-bullet" />
                          <span className="trace-line" />
                        </div>
                        <div className="trace-time">{item.timestamp}</div>
                        <div className="trace-body">
                          <div className="trace-heading">{item.title}</div>
                          <div className="trace-desc">{item.detail}</div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={traceEndRef} />
                </div>
              )}
            </div>
          </section>

          {/* RIGHT COLUMN: Code Editor + Execution Results */}
          <section className="right-col">
            {/* Code Editor Card */}
            <div className="gold-card editor-card">
              <div className="editor-tabbar">
                <div className="editor-tabs-left">
                  <div className="editor-tab active">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E5B84B" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span>Generated Solution</span>
                    <span className="tab-close">×</span>
                  </div>
                  <button className="tab-plus" onClick={() => fileInputRef.current?.click()} title="Open file">+</button>
                </div>

                <div className="editor-tabs-right">
                  {Object.keys(codeVersions).map((iter) => (
                    <button
                      key={iter}
                      className={`gold-pill-tab ${viewingIteration === Number(iter) ? 'active' : ''}`}
                      onClick={() => {
                        setViewingIteration(Number(iter));
                        setGeneratedCode(codeVersions[iter]);
                      }}
                    >
                      Iter {iter}
                    </button>
                  ))}

                  {Object.keys(codeVersions).length > 0 && (
                    <button
                      className={`gold-pill-tab diff-pill ${showDiff ? 'active' : ''}`}
                      onClick={() => setShowDiff(!showDiff)}
                    >
                      {showDiff ? 'Hide Diff' : 'Diff vs Iter 1'}
                    </button>
                  )}

                  <button
                    className="gold-pill-tab copy-pill"
                    onClick={() => navigator.clipboard.writeText(generatedCode)}
                    disabled={!generatedCode}
                  >
                    Copy .cpp
                  </button>
                </div>
              </div>

              <div className="code-viewport">
                {!generatedCode ? (
                  <div style={{ color: '#7c7569', fontSize: '13px', textAlign: 'center', marginTop: '60px' }}>
                    Waiting for Gemini to generate or patch C++20 code...
                  </div>
                ) : (
                  (() => {
                    const firstKey = Object.keys(codeVersions)[0];
                    const baseLines = firstKey ? codeVersions[firstKey].split('\n') : [];
                    const currentLines = generatedCode.split('\n');

                    return currentLines.map((line, idx) => {
                      const baseLine = baseLines[idx];
                      const isChanged =
                        showDiff && firstKey && baseLine !== undefined && line !== baseLine;

                      return (
                        <React.Fragment key={idx}>
                          {isChanged && (
                            <div className="code-line line-diff-removed">
                              <span className="line-no">{idx + 1}</span>
                              <span className="diff-sign">−</span>
                              <span
                                className="line-code"
                                dangerouslySetInnerHTML={{
                                  __html: highlightCppLine(baseLine) || '&nbsp;'
                                }}
                              />
                            </div>
                          )}
                          <div className={`code-line ${isChanged ? 'line-diff-added' : ''}`}>
                            <span className="line-no">{idx + 1}</span>
                            {isChanged && <span className="diff-sign">+</span>}
                            <span
                              className="line-code"
                              dangerouslySetInnerHTML={{
                                __html: highlightCppLine(line) || '&nbsp;'
                              }}
                            />
                          </div>
                        </React.Fragment>
                      );
                    });
                  })()
                )}
              </div>
            </div>

            {/* Execution Results Card */}
            <div className="gold-card results-card">
              <div className="card-title-bar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E5B84B" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <polygon points="10 8 16 12 10 16 10 8" fill="#E5B84B" />
                </svg>
                <span>Execution Results</span>
              </div>

              {sandboxSummary && (
                <div className="verdict-banner">
                  <div className="verdict-left">
                    <div className={`verdict-circle ${sandboxSummary.passed ? 'pass' : 'fail'}`}>
                      {sandboxSummary.passed ? '✔' : '✕'}
                    </div>
                    <div>
                      <div className={`verdict-title ${sandboxSummary.passed ? 'pass' : 'fail'}`}>
                        {sandboxSummary.passed ? 'Passed' : 'Failed'}
                      </div>
                      <div className="verdict-sub">{sandboxSummary.statusText}</div>
                    </div>
                  </div>

                  <div className="verdict-metrics">
                    <div className="v-metric">
                      <span className="v-label">Compile</span>
                      <span className="v-val">{sandboxSummary.compileTime}</span>
                    </div>
                    <div className="v-divider" />
                    <div className="v-metric">
                      <span className="v-label">Run</span>
                      <span className="v-val">{sandboxSummary.runTime}</span>
                    </div>
                    <div className="v-divider" />
                    <div className="v-metric">
                      <span className="v-label">Memory</span>
                      <span className="v-val">{sandboxSummary.memory}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="terminal-subtabs">
                <div className="subtabs-left">
                  <button
                    className={`subtab ${activeTab === 'terminal' ? 'active' : ''}`}
                    onClick={() => setActiveTab('terminal')}
                  >
                    Terminal Output
                  </button>
                  <button
                    className={`subtab ${activeTab === 'raw' ? 'active' : ''}`}
                    onClick={() => setActiveTab('raw')}
                  >
                    Raw Data
                  </button>
                </div>
                <span className="subtab-close">×</span>
              </div>

              <div className="terminal-console">
                {!sandboxSummary ? (
                  <div style={{ color: '#7c7569', fontSize: '13px', textAlign: 'center', marginTop: '45px' }}>
                    Docker C++20 sandbox output will appear here after compilation...
                  </div>
                ) : activeTab === 'terminal' ? (
                  <>
                    <div className="cmd-line">$ g++ -std=c++20 -O2 solution.cpp -o solution</div>
                    {sandboxSummary?.stderr ? (
                      <div className="compiler-err">{sandboxSummary.stderr}</div>
                    ) : (
                      <div className="compiler-ok">Compilation successful.</div>
                    )}

                    <div className="cmd-line mt-12">$ ./solution &lt; input.txt</div>
                    <div className="stdin-label">stdin:</div>
                    <pre className="stdin-block">{sandboxSummary?.stdin}</pre>

                    <div className="output-comparison">
                      <div className="out-col">
                        <div className="out-green-label">expected output:</div>
                        <div className="out-val">{sandboxSummary?.expected}</div>
                      </div>
                      <div className="out-col">
                        <div className="out-green-label">actual output:</div>
                        <div className="out-val">{sandboxSummary?.actual}</div>
                      </div>
                    </div>
                  </>
                ) : (
                  <pre className="raw-data-pre">{JSON.stringify(rawOutput, null, 2)}</pre>
                )}
              </div>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}