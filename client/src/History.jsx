import { useEffect, useMemo, useState } from 'react';
import './History.css';

/**
 * Normalizes both Schema v2 events and legacy (Runs #1-#32) events
 * into a consistent structure for the Execution Trace UI.
 */
function normalizeRunEvents(rawEvents = []) {
    const codeByIteration = {};
    const ioByIteration = {};

    // First pass: collect C++ code and stdin/expectedOutput per iteration from TOOL_CALLs
    rawEvents.forEach((ev) => {
        const p = ev.payload || {};
        const type = ev.event_type || p.type;
        const iter = p.iteration || 0;

        if (type === 'TOOL_CALL') {
            const inferredTool =
                p.tool ||
                (p.reasoning?.startsWith('Read ')
                    ? 'read_file'
                    : p.reasoning?.startsWith('Patched ')
                    ? 'write_file'
                    : 'execute_cpp_code');

            if (inferredTool === 'execute_cpp_code' && p.code && iter) {
                codeByIteration[iter] = p.code;
            }
            if (iter && (p.stdin !== undefined || p.expectedOutput !== undefined)) {
                ioByIteration[iter] = {
                    stdin: p.stdin ?? p.args?.stdin_input ?? '',
                    expectedOutput: p.expectedOutput ?? p.args?.expected_output ?? '',
                };
            }
        }
    });

    // Second pass: enrich each event
    return rawEvents.map((ev, index) => {
        const p = ev.payload || {};
        const type = ev.event_type || p.type || 'EVENT';
        const iteration = p.iteration ?? null;

        // Detect legacy rate-limiter or list_files inside THOUGHT events
        const rawContent = String(p.content || p.message || '');
        const isRateLimit =
            p.category === 'rate_limit' ||
            rawContent.includes('Rate limiter') ||
            rawContent.includes('429');
        const isLegacyListFiles =
            type === 'THOUGHT' && rawContent.startsWith('📂 Repo files:');

        // Infer tool name for legacy TOOL_CALL events
        let toolName = p.tool || null;
        if (type === 'TOOL_CALL' && !toolName) {
            if (p.reasoning?.startsWith('Read ')) toolName = 'read_file';
            else if (p.reasoning?.startsWith('Patched ')) toolName = 'write_file';
            else toolName = 'execute_cpp_code';
        }
        if (isLegacyListFiles) {
            toolName = 'list_files';
        }

        // Category for filtering: 'lifecycle' | 'reasoning' | 'tool' | 'sandbox'
        let category = 'lifecycle';
        if (isLegacyListFiles || type === 'TOOL_CALL') category = 'tool';
        else if (type === 'THOUGHT') category = 'reasoning';
        else if (type === 'SANDBOX_RESULT') category = 'sandbox';

        // Pair sandbox I/O with preceding TOOL_CALL if legacy event lacks p.io
        const fallbackIO = (iteration && ioByIteration[iteration]) || {};
        const resultObj = p.result || {};
        const io = {
            stdin: p.io?.stdin ?? fallbackIO.stdin ?? '',
            expectedOutput: p.io?.expectedOutput ?? fallbackIO.expectedOutput ?? '',
            actualOutput: p.io?.actualOutput ?? resultObj.stdout ?? '',
            stderr: p.io?.stderr ?? resultObj.stderr ?? '',
        };

        const sandboxMeta = p.sandboxMeta || {
            language: 'C++20',
            compiler: 'g++ -std=c++20 -O2',
            timeLimitMs: 2000,
            memoryLimitKb: 262144,
        };

        return {
            id: ev.id ?? index,
            index: index + 1,
            type: isLegacyListFiles ? 'TOOL_CALL' : type,
            rawType: type,
            category,
            isRateLimit,
            iteration,
            toolName,
            createdAt: ev.created_at || p.timestamp || null,
            payload: p,
            io,
            sandboxMeta,
            codeByIteration,
        };
    });
}

export default function History() {
    const [runs, setRuns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedRun, setSelectedRun] = useState(null);

    const [runEvents, setRunEvents] = useState([]);
    const [eventsLoading, setEventsLoading] = useState(false);

    // Pagination states
    const [runPage, setRunPage] = useState(1);
    const [eventPage, setEventPage] = useState(1);

    // Trace Filter & UI states
    const [iterFilter, setIterFilter] = useState('ALL');
    const [categoryFilter, setCategoryFilter] = useState('ALL');
    const [expandedRawIds, setExpandedRawIds] = useState({});
    const [expandedCodeIds, setExpandedCodeIds] = useState({});
    const [diffModeIds, setDiffModeIds] = useState({});
    const [copiedId, setCopiedId] = useState(null);

    const RUNS_PER_PAGE = 10;
    const EVENTS_PER_PAGE = 6;

    const getPageNumbers = (current, total) => {
        if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
        if (current <= 4) return [1, 2, 3, 4, 5, '...', total];
        if (current >= total - 3)
            return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
        return [1, '...', current - 1, current, current + 1, '...', total];
    };

    useEffect(() => {
        setEventPage(1);
        setIterFilter('ALL');
        setCategoryFilter('ALL');
        setExpandedRawIds({});
        setExpandedCodeIds({});
        setDiffModeIds({});

        if (!selectedRun) {
            setRunEvents([]);
            return;
        }

        const fetchRunEvents = async () => {
            try {
                setEventsLoading(true);
                const response = await fetch(
                    `http://localhost:3001/api/agent/runs/${selectedRun.id}/events`,
                    { credentials: 'include' }
                );

                if (!response.ok) {
                    throw new Error(`Request failed: ${response.status}`);
                }

                const data = await response.json();
                setRunEvents(data.events || []);
            } catch (err) {
                console.error('Failed to fetch run events:', err);
                setRunEvents([]);
            } finally {
                setEventsLoading(false);
            }
        };

        fetchRunEvents();
    }, [selectedRun]);

    useEffect(() => {
        async function fetchRuns() {
            try {
                const response = await fetch('http://localhost:3001/api/agent/runs', {
                    credentials: 'include',
                });

                if (!response.ok) {
                    throw new Error(`Request failed: ${response.status}`);
                }

                const data = await response.json();
                setRuns(data.runs ?? []);
            } catch (err) {
                console.error('Failed to fetch run history:', err);
                setError('Could not load run history. Please try again.');
            } finally {
                setLoading(false);
            }
        }

        fetchRuns();
    }, []);

    const normalizedEvents = useMemo(() => normalizeRunEvents(runEvents), [runEvents]);

    // Extract distinct iterations present in this run
    const availableIterations = useMemo(() => {
        const set = new Set();
        normalizedEvents.forEach((ev) => {
            if (ev.iteration && ev.iteration > 0) set.add(ev.iteration);
        });
        return Array.from(set).sort((a, b) => a - b);
    }, [normalizedEvents]);

    // Filter events by Iteration & Category
    // const filteredEvents = useMemo(() => {
    //     return normalizedEvents.filter((ev) => {
    //         if (iterFilter !== 'ALL' && ev.iteration !== Number(iterFilter)) {
    //             return false;
    //         }
    //         if (categoryFilter !== 'ALL' && ev.category !== categoryFilter) {
    //             return false;
    //         }
    //         return true;
    //     });
    // }, [normalizedEvents, iterFilter, categoryFilter]);

    // Filter events by Iteration & Category
    const filteredEvents = useMemo(() => {
        return normalizedEvents.filter((ev) => {
            if (iterFilter !== 'ALL' && ev.iteration !== Number(iterFilter)) {
                return false;
            }
            if (categoryFilter === 'reasoning') {
                return (
                    ev.type === 'THOUGHT' ||
                    ev.type === 'TOOL_CALL' ||
                    ev.type === 'FINAL_ANSWER'
                );
            }
            if (categoryFilter !== 'ALL' && ev.category !== categoryFilter) {
                return false;
            }
            return true;
        });
    }, [normalizedEvents, iterFilter, categoryFilter]);

    const totalRunPages = Math.max(1, Math.ceil(runs.length / RUNS_PER_PAGE));
    const paginatedRuns = runs.slice(
        (runPage - 1) * RUNS_PER_PAGE,
        runPage * RUNS_PER_PAGE
    );

    const totalEventPages = Math.max(
        1,
        Math.ceil(filteredEvents.length / EVENTS_PER_PAGE)
    );
    const paginatedEvents = filteredEvents.slice(
        (eventPage - 1) * EVENTS_PER_PAGE,
        eventPage * EVENTS_PER_PAGE
    );

    const toggleRawJson = (id) => {
        setExpandedRawIds((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    const toggleCodeDrawer = (id) => {
        setExpandedCodeIds((prev) => ({
            ...prev,
            [id]: prev[id] === undefined ? false : !prev[id],
        }));
    };

    const toggleDiffMode = (id) => {
        setDiffModeIds((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    const handleCopyCode = (id, codeText) => {
        navigator.clipboard.writeText(codeText || '');
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 1500);
    };

    const renderEventCard = (ev) => {
        const p = ev.payload;
        const isRawOpen = Boolean(expandedRawIds[ev.id]);
        const isCodeOpen = expandedCodeIds[ev.id] !== false; // Open by default
        const isDiffOn = Boolean(diffModeIds[ev.id]);
        const baselineCode = ev.codeByIteration?.[1] || '';
        const canDiff =
            ev.toolName === 'execute_cpp_code' &&
            ev.iteration > 1 &&
            baselineCode &&
            p.code &&
            baselineCode !== p.code;

        return (
            <div
                key={ev.id}
                className={`trace-card trace-type-${ev.type.toLowerCase()} ${
                    ev.isRateLimit ? 'trace-rate-limit' : ''
                }`}
            >
                {/* Top Card Header */}
                {/* <div className="trace-card-header">
                    <div className="trace-header-left">
                        <span className="trace-step-num">#{ev.index}</span>
                        <span className={`trace-badge badge-${ev.type.toLowerCase()}`}>
                            {ev.isRateLimit
                                ? '⏳ RATE LIMITER'
                                : ev.type === 'ITERATION_START'
                                ? `🔄 ITERATION ${ev.iteration}`
                                : ev.type === 'TOOL_CALL'
                                ? `🛠 TOOL: ${ev.toolName}`
                                : ev.type === 'SANDBOX_RESULT'
                                ? '🧪 SANDBOX RESULT'
                                : ev.type === 'THOUGHT'
                                ? '🧠 AGENT REASONING'
                                : ev.type === 'FINAL_ANSWER'
                                ? '✅ FINAL SOLUTION'
                                : ev.type}
                        </span> */}

                        <div className="trace-card-header">
                    <div className="trace-header-left">
                        <span className="trace-step-num">#{ev.index}</span>
                        <span className={`trace-badge badge-${ev.type.toLowerCase()}`}>
                            {ev.isRateLimit
                                ? '⏳ RATE LIMITER'
                                : ev.type === 'ITERATION_START'
                                ? `🔄 ITERATION ${ev.iteration}`
                                : ev.type === 'TOOL_CALL' && categoryFilter === 'reasoning'
                                ? `🧠 REASONING (${ev.toolName})`
                                : ev.type === 'TOOL_CALL'
                                ? `🛠 TOOL: ${ev.toolName}`
                                : ev.type === 'SANDBOX_RESULT'
                                ? '🧪 SANDBOX RESULT'
                                : ev.type === 'THOUGHT'
                                ? '🧠 AGENT REASONING'
                                : ev.type === 'FINAL_ANSWER'
                                ? '✅ FINAL SOLUTION'
                                : ev.type}
                        </span>

                        {ev.iteration > 0 && ev.type !== 'ITERATION_START' && (
                            <span className="trace-iter-pill">Iter {ev.iteration}</span>
                        )}
                    </div>

                    <div className="trace-header-right">
                        {ev.createdAt && (
                            <span className="trace-timestamp">
                                {new Date(ev.createdAt).toLocaleTimeString()}
                            </span>
                        )}
                        <button
                            type="button"
                            className={`raw-json-btn ${isRawOpen ? 'active' : ''}`}
                            onClick={() => toggleRawJson(ev.id)}
                            title="Inspect Raw Event Payload"
                        >
                            {'{ }'} JSON
                        </button>
                    </div>
                </div>

                {/* 1. LIFECYCLE EVENTS (SYSTEM_READY, ITERATION_START, STREAM_COMPLETE, MAX_ITERATIONS_REACHED) */}
                {ev.type === 'SYSTEM_READY' && (
                    <div className="trace-body-compact">
                        <p className="trace-text">
                            {p.message || 'Autonomous SWE Orchestrator initialized.'}
                        </p>
                        {p.model && (
                            <span className="trace-meta-chip">Model: {p.model}</span>
                        )}
                    </div>
                )}

                {ev.type === 'ITERATION_START' && (
                    <div className="trace-body-compact">
                        <p className="trace-text">
                            Starting <strong>Iteration {ev.iteration}</strong> of{' '}
                            {p.maxIterations || 5} — requesting LLM reasoning &amp; tool
                            dispatch.
                        </p>
                    </div>
                )}

                {/* 2. AGENT REASONING & RATE LIMITER (THOUGHT) */}
                {ev.type === 'THOUGHT' && (
                    <div className="trace-body">
                        <p className="trace-thought-text">
                            {p.summary || p.content || 'Agent reasoning step.'}
                        </p>
                        {p.summary &&
                            p.content &&
                            p.content.length > p.summary.length + 20 && (
                                <details className="trace-details">
                                    <summary>Show full reasoning monologue</summary>
                                    <pre className="trace-pre-light">{p.content}</pre>
                                </details>
                            )}
                    </div>
                )}

                {/* 3. TOOL CALLS & GENERATED SOURCE CODE (TOOL_CALL) */}
                {ev.type === 'TOOL_CALL' && (
                    <div className="trace-body">
                        {p.status === 'MALFORMED_TOOL_ARGUMENTS' ? (
                            <div className="trace-alert-error">
                                <strong>Malformed Tool Arguments:</strong>{' '}
                                {p.error || p.reasoning}
                            </div>
                        ) : (
                            <>
                                <div className="trace-tool-summary">
                                    <span className="tool-fn-tag">
                                        {ev.toolName}()
                                    </span>
                                    <span className="trace-reasoning-line">
                                        {p.reasoning ||
                                            p.content ||
                                            `Invoked ${ev.toolName}`}
                                    </span>
                                </div>

                                {/* Tool Arguments Chips */}
                                <div className="trace-meta-row">
                                    {p.args?.filepath && (
                                        <span className="trace-meta-chip">
                                            📄 File: ./repo/{p.args.filepath}
                                        </span>
                                    )}
                                    {p.args?.bytes !== undefined && (
                                        <span className="trace-meta-chip">
                                            📦 {p.args.bytes} bytes
                                        </span>
                                    )}
                                    {p.args?.code_lines !== undefined && (
                                        <span className="trace-meta-chip">
                                            📝 {p.args.code_lines} lines ({p.args.code_bytes} B)
                                        </span>
                                    )}
                                    {p.resultSummary && (
                                        <span className="trace-meta-chip">
                                            📂 {p.resultSummary}
                                        </span>
                                    )}
                                </div>

                                {/* Generated / Patched C++20 Code Viewer */}
                                {/* {p.code && (
                                    <div className="trace-code-box">
                                        <div className="trace-code-bar"> */}
                                        {/* Generated / Patched C++20 Code Viewer */}
                                {p.code && categoryFilter !== 'reasoning' && (
                                    <div className="trace-code-box">
                                        <div className="trace-code-bar">
                                            <button
                                                type="button"
                                                className="code-toggle-btn"
                                                onClick={() => toggleCodeDrawer(ev.id)}
                                            >
                                                {isCodeOpen ? '▼' : '▶'}{' '}
                                                {ev.toolName === 'read_file'
                                                    ? `File Contents (${p.args?.filepath || 'repo'})`
                                                    : ev.toolName === 'write_file'
                                                    ? `Patched File (${p.args?.filepath || 'repo'})`
                                                    : `Generated C++20 Source (Iteration ${ev.iteration || 1})`}
                                            </button>

                                            <div className="trace-code-actions">
                                                {canDiff && (
                                                    <button
                                                        type="button"
                                                        className={`trace-mini-btn ${
                                                            isDiffOn ? 'active' : ''
                                                        }`}
                                                        onClick={() => toggleDiffMode(ev.id)}
                                                    >
                                                        {isDiffOn
                                                            ? 'Hide Diff'
                                                            : 'Diff vs Iter 1'}
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    className="trace-mini-btn"
                                                    onClick={() =>
                                                        handleCopyCode(ev.id, p.code)
                                                    }
                                                >
                                                    {copiedId === ev.id
                                                        ? '✔ Copied'
                                                        : '📋 Copy'}
                                                </button>
                                            </div>
                                        </div>

                                        {isCodeOpen && (
                                            <div className="trace-code-lines">
                                                {p.code.split('\n').map((line, i) => {
                                                    const baseLine =
                                                        baselineCode.split('\n')[i] ?? '';
                                                    const isChanged =
                                                        isDiffOn &&
                                                        canDiff &&
                                                        line !== baseLine;
                                                    return (
                                                        <div
                                                            key={i}
                                                            className={`trace-code-line ${
                                                                isChanged
                                                                    ? 'line-diff-added'
                                                                    : ''
                                                            }`}
                                                        >
                                                            <span className="trace-line-num">
                                                                {i + 1}
                                                            </span>
                                                            <span className="trace-line-content">
                                                                {isChanged ? `+ ${line}` : line}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* 4. SANDBOX EXECUTION RESULT, METRICS & I/O (SANDBOX_RESULT) */}
                {ev.type === 'SANDBOX_RESULT' && (
                    <div className="trace-body">
                        <div className="sandbox-verdict-bar">
                            <span
                                className={`sandbox-verdict-pill ${
                                     p.result?.passed ? 'verdict-pass' : 'verdict-fail'
                                }`}
                            >
                                {p.result?.passed
                                    ? '✔ PASSED (ACCEPTED)'
                                    : `✖ ${p.result?.status || 'FAILED'}`}
                            </span>

                            <div className="trace-meta-row">
                                <span className="trace-meta-chip">
                                    ⏱ {p.result?.execution_time_ms ?? 0}ms
                                </span>
                                <span className="trace-meta-chip">
                                    Exit Code: {p.result?.exit_code ?? 0}
                                </span>
                                <span className="trace-meta-chip">
                                    ⚙ {ev.sandboxMeta.compiler}
                                </span>
                                <span className="trace-meta-chip">
                                    🛡 {Math.round(ev.sandboxMeta.memoryLimitKb / 1024)}MB Cap
                                </span>
                            </div>
                        </div>

                        {/* Standard I/O Comparison Grid */}
                        {(ev.io.stdin ||
                            ev.io.expectedOutput ||
                            ev.io.actualOutput) && (
                            <div className="sandbox-io-grid">
                                <div className="io-panel">
                                    <div className="io-label">stdin (Test Input)</div>
                                    <pre className="io-box">
                                        {ev.io.stdin || '(empty)'}
                                    </pre>
                                </div>
                                <div className="io-panel">
                                    <div className="io-label">Expected Output</div>
                                    <pre className="io-box">
                                        {ev.io.expectedOutput || '(empty)'}
                                    </pre>
                                </div>
                                <div className="io-panel">
                                    <div className="io-label">
                                        Actual stdout{' '}
                                        {p.result?.passed ? '✔' : '✖'}
                                    </div>
                                    <pre
                                        className={`io-box ${
                                            p.result?.passed
                                                ? 'io-pass'
                                                : 'io-fail'
                                        }`}
                                    >
                                        {ev.io.actualOutput || '(no stdout)'}
                                    </pre>
                                </div>
                            </div>
                        )}

                        {/* Compiler / Runtime Error Diagnostics (stderr) */}
                        {ev.io.stderr && (
                            <div className="sandbox-stderr-block">
                                <div className="stderr-title">
                                    ⚠️ Compiler / Runtime Diagnostics (stderr)
                                </div>
                                <pre className="stderr-pre">{ev.io.stderr}</pre>
                            </div>
                        )}
                    </div>
                )}

                {/* 5. FINAL COMPLETION / GUARDRAIL / ERROR */}
                {ev.type === 'FINAL_ANSWER' && (
                    <div className="trace-body">
                        <div
                            className={`final-banner ${
                                p.solved ? 'final-solved' : 'final-unsolved'
                            }`}
                        >
                            <strong>
                                {p.solved
                                    ? `✔ Solution Verified on Iteration ${ev.iteration || 1}`
                                    : '⚠️ Agent Loop Finished Without Sandbox Pass'}
                            </strong>
                            <p>
                                {p.summary ||
                                    'All test cases verified inside the isolated C++20 sandbox.'}
                            </p>
                        </div>
                    </div>
                )}

                {(ev.type === 'MAX_ITERATIONS_REACHED' ||
                    ev.type === 'ERROR') && (
                    <div className="trace-body">
                        <div className="trace-alert-error">
                            <strong>
                                {ev.type === 'ERROR'
                                    ? '💥 Execution Error: '
                                    : '⛔ Max Iterations Reached: '}
                            </strong>
                            {p.message ||
                                'Agent terminated before reaching a verified solution.'}
                        </div>
                    </div>
                )}

                {ev.type === 'STREAM_COMPLETE' && (
                    <div className="trace-body-compact">
                        <p className="trace-text">
                            Run stream completed — Final Status:{' '}
                            <strong
                                style={{
                                    color: p.success ? '#45d483' : '#ff8378',
                                    textTransform: 'uppercase',
                                }}
                            >
                                {p.status || (p.success ? 'passed' : 'failed')}
                            </strong>{' '}
                            ({p.iterationsUsed || ev.iteration || 0} iteration
                            {(p.iterationsUsed || ev.iteration) === 1 ? '' : 's'} used)
                        </p>
                    </div>
                )}

                {/* Optional Raw JSON Drawer for Debugging */}
                {isRawOpen && (
                    <pre className="trace-raw-json">
                        {JSON.stringify(p, null, 2)}
                    </pre>
                )}
            </div>
        );
    };

    if (loading) {
        return <div className="history-page">Loading run history...</div>;
    }

    if (error) {
        return <div className="history-page">{error}</div>;
    }

    return (
        <div className={`history-page ${selectedRun ? 'split-view' : ''}`}>
            <div className="history-header">
                <div>
                    <h1>Run History</h1>
                    <p>Review your previous AutoSWE agent executions and full diagnostic traces.</p>
                </div>

                <span>{runs.length} runs</span>
            </div>

            {runs.length === 0 ? (
                <div className="history-empty">
                    <h2>No runs yet</h2>
                    <p>Run an agent task in Workspace and it will appear here.</p>
                </div>
            ) : (
                <div className={`history-content ${selectedRun ? 'has-selection' : ''}`}>
                    {/* LEFT PANEL: Paginated Run List */}
                    <div className="history-list">
                        {paginatedRuns.map((run) => (
                            <div
                                className={`history-card ${
                                    selectedRun?.id === run.id ? 'selected' : ''
                                }`}
                                key={run.id}
                                onClick={() => setSelectedRun(run)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setSelectedRun(run);
                                    }
                                }}
                            >
                                <div className="history-card-main">
                                    <h3>
                                        {run.problem?.split('\n')[0] || `Run #${run.id}`}
                                    </h3>

                                    <p>
                                        Run #{run.id} ·{' '}
                                        {run.started_at
                                            ? new Date(run.started_at).toLocaleString()
                                            : 'Date unavailable'}
                                    </p>
                                </div>

                                <div className="history-card-meta">
                                    <span className={`history-status ${run.status}`}>
                                        {run.status}
                                    </span>
                                    <span>
                                        {run.iterations} iteration
                                        {run.iterations === 1 ? '' : 's'}
                                    </span>
                                </div>
                            </div>
                        ))}

                        {totalRunPages > 1 && (
                            <div className="history-pagination">
                                <button
                                    type="button"
                                    className="page-btn nav-btn"
                                    disabled={runPage === 1}
                                    onClick={() => setRunPage((p) => Math.max(1, p - 1))}
                                >
                                    ‹ Prev
                                </button>

                                {getPageNumbers(runPage, totalRunPages).map((item, idx) =>
                                    item === '...' ? (
                                        <span key={`run-dots-${idx}`} className="page-ellipsis">
                                            ...
                                        </span>
                                    ) : (
                                        <button
                                            type="button"
                                            key={item}
                                            className={`page-btn ${
                                                runPage === item ? 'active' : ''
                                            }`}
                                            onClick={() => setRunPage(item)}
                                        >
                                            {item}
                                        </button>
                                    )
                                )}

                                <button
                                    type="button"
                                    className="page-btn nav-btn"
                                    disabled={runPage === totalRunPages}
                                    onClick={() =>
                                        setRunPage((p) => Math.min(totalRunPages, p + 1))
                                    }
                                >
                                    Next ›
                                </button>
                            </div>
                        )}
                    </div>

                    {/* RIGHT PANEL: Structured Execution Trace */}
                    {selectedRun && (
                        <div className="history-detail">
                            <div className="history-detail-header">
                                <div className="detail-title-group">
                                    <div className="detail-title-row">
                                        <h2>Run #{selectedRun.id} — Execution Trace</h2>
                                        <span
                                            className={`history-status ${selectedRun.status}`}
                                        >
                                            {selectedRun.status}
                                        </span>
                                        <span className="detail-meta-pill">
                                            {selectedRun.iterations} iteration
                                            {selectedRun.iterations === 1 ? '' : 's'}
                                        </span>
                                    </div>

                                    <details className="problem-prompt-drawer">
                                        <summary>
                                            {selectedRun.problem?.split('\n')[0] ||
                                                'View full problem specification'}
                                        </summary>
                                        <pre>{selectedRun.problem}</pre>
                                    </details>
                                </div>

                                <button
                                    type="button"
                                    className="close-trace-btn"
                                    onClick={() => setSelectedRun(null)}
                                >
                                    Close ✕
                                </button>
                            </div>

                            {/* Iteration & Category Filter Bar */}
                            {!eventsLoading && normalizedEvents.length > 0 && (
                                <div className="trace-filter-bar">
                                    <div className="filter-group">
                                        <span className="filter-label">Iteration:</span>
                                        <button
                                            type="button"
                                            className={`filter-pill ${
                                                iterFilter === 'ALL' ? 'active' : ''
                                            }`}
                                            onClick={() => {
                                                setIterFilter('ALL');
                                                setEventPage(1);
                                            }}
                                        >
                                            All
                                        </button>
                                        {availableIterations.map((it) => (
                                            <button
                                                type="button"
                                                key={it}
                                                className={`filter-pill ${
                                                    Number(iterFilter) === it ? 'active' : ''
                                                }`}
                                                onClick={() => {
                                                    setIterFilter(it);
                                                    setEventPage(1);
                                                }}
                                            >
                                                Iter {it}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="filter-group">
                                        <span className="filter-label">Type:</span>
                                        {[
                                            { id: 'ALL', label: 'All Events' },
                                            { id: 'reasoning', label: '🧠 Reasoning' },
                                            { id: 'tool', label: '🛠 Tools & Code' },
                                            { id: 'sandbox', label: '🧪 Sandbox' },
                                        ].map((tab) => (
                                            <button
                                                type="button"
                                                key={tab.id}
                                                className={`filter-pill ${
                                                    categoryFilter === tab.id ? 'active' : ''
                                                }`}
                                                onClick={() => {
                                                    setCategoryFilter(tab.id);
                                                    setEventPage(1);
                                                }}
                                            >
                                                {tab.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {eventsLoading ? (
                                <p className="trace-empty-msg">Loading execution trace...</p>
                            ) : filteredEvents.length === 0 ? (
                                <p className="trace-empty-msg">
                                    No matching events found for this filter.
                                </p>
                            ) : (
                                <div className="history-events">
                                    {paginatedEvents.map((ev) => renderEventCard(ev))}

                                    {totalEventPages > 1 && (
                                        <div className="history-pagination">
                                            <button
                                                type="button"
                                                className="page-btn nav-btn"
                                                disabled={eventPage === 1}
                                                onClick={() =>
                                                    setEventPage((p) => Math.max(1, p - 1))
                                                }
                                            >
                                                ‹ Prev
                                            </button>

                                            {getPageNumbers(eventPage, totalEventPages).map(
                                                (item, idx) =>
                                                    item === '...' ? (
                                                        <span
                                                            key={`ev-dots-${idx}`}
                                                            className="page-ellipsis"
                                                        >
                                                            ...
                                                        </span>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            key={item}
                                                            className={`page-btn ${
                                                                eventPage === item
                                                                    ? 'active'
                                                                    : ''
                                                            }`}
                                                            onClick={() => setEventPage(item)}
                                                        >
                                                            {item}
                                                        </button>
                                                    )
                                            )}

                                            <button
                                                type="button"
                                                className="page-btn nav-btn"
                                                disabled={eventPage === totalEventPages}
                                                onClick={() =>
                                                    setEventPage((p) =>
                                                        Math.min(totalEventPages, p + 1)
                                                    )
                                                }
                                            >
                                                Next ›
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}