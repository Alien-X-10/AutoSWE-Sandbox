import { useState, useRef } from 'react';

const PRESETS = [
  {
    label: '💥 Force Integer Overflow -> Self-Heal',
    prompt: `Write a C++20 program to add two numbers. IMPORTANT: On your FIRST attempt, you MUST use 32-bit 'int' variables. Only switch to 'long long' after observing the sandbox failure.\nTest Input: 2000000000 2000000000\nExpected Output: 4000000000`
  },
  {
    label: '🩸 Force Segfault / Out-of-Bounds -> Self-Heal',
    prompt: `Write a C++20 program that reads N, then N integers, and prints the last integer. IMPORTANT: On your FIRST attempt, intentionally access vec.at(N) (out-of-bounds) so the sandbox throws std::out_of_range, then fix it to vec[N-1] on your second attempt.\nTest Input: 3\n10 20 30\nExpected Output: 30`
  },
  {
    label: '⚡ Kadane’s Max Subarray Sum (64-bit)',
    prompt: `Write a C++20 program that reads N, followed by N space-separated integers, and prints the maximum contiguous subarray sum.\nTest Input: 5\n-2 1000000000 -3 1000000000 -1\nExpected Output: 1999999997`
  }
];

export default function App() {
  const [prompt, setPrompt] = useState(PRESETS[0].prompt);
  const [events, setEvents] = useState([]);
  const [running, setRunning] = useState(false);
  const [selectedIter, setSelectedIter] = useState(null);
  const [showDiff, setShowDiff] = useState(false);
  const esRef = useRef(null);

  const startAgent = () => {
    if (!prompt.trim() || running) return;
    setEvents([]);
    setSelectedIter(null);
    setShowDiff(false);
    setRunning(true);

    const es = new EventSource(`http://localhost:3001/api/agent/stream?prompt=${encodeURIComponent(prompt)}`);
    esRef.current = es;

    const push = (e) => {
      const data = JSON.parse(e.data);
      setEvents((prev) => [...prev, data]);
      if (data.type === 'TOOL_CALL') setSelectedIter(data.iteration);
    };

    ['SYSTEM_READY', 'ITERATION_START', 'THOUGHT', 'TOOL_CALL', 'SANDBOX_RESULT', 'FINAL_ANSWER'].forEach(
      (type) => es.addEventListener(type, push)
    );

    const stop = (e) => {
      if (e?.data) push(e);
      setRunning(false);
      es.close();
    };
    es.addEventListener('STREAM_COMPLETE', stop);
    es.addEventListener('ERROR', stop);
    es.onerror = () => stop();
  };

  const toolCalls = events.filter((e) => e.type === 'TOOL_CALL');
  const activeTool = toolCalls.find((t) => t.iteration === selectedIter) || toolCalls[toolCalls.length - 1];
  const sandboxLogs = events.filter((e) => e.type === 'SANDBOX_RESULT');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: '#0d1117', color: '#e6edf3', fontFamily: 'monospace', padding: '16px', boxSizing: 'border-box', gap: '12px', textAlign: 'left' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span style={{ color: '#8b949e', fontSize: '13px' }}>Presets:</span>
        {PRESETS.map((p, idx) => (
          <button key={idx} onClick={() => setPrompt(p.prompt)} style={{ background: '#21262d', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer', fontSize: '12px' }}>
            {p.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} style={{ flex: 1, background: '#161b22', color: '#fff', border: '1px solid #30363d', borderRadius: '6px', padding: '8px', fontFamily: 'monospace' }} />
        <button onClick={startAgent} disabled={running} style={{ background: running ? '#30363d' : '#238636', color: '#fff', border: 'none', borderRadius: '6px', padding: '0 24px', cursor: 'pointer', fontWeight: 'bold' }}>
          {running ? 'Running...' : 'Run Agent 🚀'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', flex: 1, overflow: 'hidden' }}>
        <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', padding: '12px', overflowY: 'auto' }}>
          <h3 style={{ marginTop: 0, color: '#58a6ff' }}>🧠 ReAct Monologue & Telemetry</h3>
          {events.map((ev, i) => (
            <div key={i} style={{ marginBottom: '10px', padding: '8px', background: '#0d1117', borderRadius: '4px', borderLeft: '3px solid #58a6ff', whiteSpace: 'pre-wrap', fontSize: '13px' }}>
              <strong>[{ev.type}] {ev.iteration ? `(Iter ${ev.iteration})` : ''}</strong>
              <div>{ev.message || ev.reasoning || ev.content || (ev.result && `Status: ${ev.result.status} (${ev.result.execution_time_ms}ms)`)}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflow: 'hidden' }}>
          <div style={{ flex: 1, background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', padding: '12px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h3 style={{ margin: 0, color: '#d2a8ff' }}>💻 Generated C++20 Code</h3>
              <div style={{ display: 'flex', gap: '6px' }}>
                {toolCalls.map((tc) => (
                  <button
                    key={tc.iteration}
                    onClick={() => setSelectedIter(tc.iteration)}
                    style={{
                      background: (selectedIter || toolCalls[toolCalls.length - 1]?.iteration) === tc.iteration ? '#58a6ff' : '#21262d',
                      color: '#fff', border: 'none', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', fontSize: '12px'
                    }}
                  >
                    Iter {tc.iteration}
                  </button>
                ))}
                {toolCalls.length > 1 && (
                  <button
                    onClick={() => setShowDiff(!showDiff)}
                    style={{ background: showDiff ? '#8957e5' : '#21262d', color: '#fff', border: '1px solid #8957e5', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', fontSize: '12px' }}
                  >
                    {showDiff ? 'Hide Diff' : 'Diff vs Iter 1'}
                  </button>
                )}
                {activeTool && (
                  <button
                    onClick={() => navigator.clipboard.writeText(activeTool.code)}
                    style={{ background: '#238636', color: '#fff', border: 'none', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', fontSize: '12px' }}
                  >
                    Copy .cpp
                  </button>
                )}
              </div>
            </div>

            <pre style={{ margin: 0, fontSize: '13px', color: '#a5d6ff' }}>
              {showDiff && toolCalls.length > 1 && activeTool
                ? activeTool.code.split('\n').map((line, i) => {
                    const baseLine = toolCalls[0].code.split('\n')[i];
                    const changed = baseLine !== undefined && baseLine !== line;
                    return (
                      <div key={i}>
                        {changed && <div style={{ background: 'rgba(248, 81, 73, 0.25)', color: '#ff7b72' }}>- {baseLine}</div>}
                        <div style={{ background: changed ? 'rgba(46, 160, 67, 0.25)' : 'transparent', color: changed ? '#3fb950' : '#a5d6ff' }}>
                          {changed ? `+ ${line}` : `  ${line}`}
                        </div>
                      </div>
                    );
                  })
                : (activeTool ? activeTool.code : '// C++ code will appear here...')}
            </pre>
          </div>

          <div style={{ flex: 1, background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', padding: '12px', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0, color: '#3fb950' }}>⚡ Sandbox Execution Logs</h3>
            {sandboxLogs.map((log, i) => (
              <div key={i} style={{ marginBottom: '10px', padding: '8px', background: '#0d1117', borderLeft: `3px solid ${log.result.passed ? '#3fb950' : '#f85149'}`, fontSize: '12px' }}>
                <div><strong>Iter {log.iteration}: {log.result.status}</strong> (Exit: {log.result.exit_code} | {log.result.execution_time_ms}ms)</div>
                {log.result.stdout && <div>Stdout: <code>{log.result.stdout}</code></div>}
                {log.result.stderr && <div style={{ color: '#ff7b72', whiteSpace: 'pre-wrap' }}>Stderr: <code>{log.result.stderr}</code></div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}