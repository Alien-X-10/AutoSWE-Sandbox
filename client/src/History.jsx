import { useEffect, useState } from 'react';
import './History.css';

export default function History() {
    const [runs, setRuns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedRun, setSelectedRun] = useState(null);

    const [runEvents, setRunEvents] = useState([]);
    const [eventsLoading, setEventsLoading] = useState(false);

    const [runPage, setRunPage] = useState(1);
    const [eventPage, setEventPage] = useState(1);

    const RUNS_PER_PAGE = 10;
    const EVENTS_PER_PAGE = 5;

    const totalRunPages = Math.max(1, Math.ceil(runs.length / RUNS_PER_PAGE));
    const paginatedRuns = runs.slice(
        (runPage - 1) * RUNS_PER_PAGE,
        runPage * RUNS_PER_PAGE
    );

    const totalEventPages = Math.max(1, Math.ceil(runEvents.length / EVENTS_PER_PAGE));
    const paginatedEvents = runEvents.slice(
        (eventPage - 1) * EVENTS_PER_PAGE,
        eventPage * EVENTS_PER_PAGE
    );

    const getPageNumbers = (current, total) => {
        if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
        if (current <= 4) return [1, 2, 3, 4, 5, '...', total];
        if (current >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
        return [1, '...', current - 1, current, current + 1, '...', total];
    };

    useEffect(() => {
        setEventPage(1); // <-- Resets trace to Page 1 when switching runs
        if (!selectedRun) {
            setRunEvents([]);
            return;
        }

        const fetchRunEvents = async () => {
            try {
                setEventsLoading(true);

                // const response = await fetch(
                //     `http://localhost:3001/api/agent/runs/${selectedRun.id}/events`
                // );
                const response = await fetch(
    `http://localhost:3001/api/agent/runs/${selectedRun.id}/events`,
    {
        credentials: 'include',
    }
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
                const response = await fetch(
                    'http://localhost:3001/api/agent/runs',
                    {
                        credentials: 'include',
                    }
                );

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
                    <p>Review your previous AutoSWE agent executions.</p>
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
                    <div className="history-list">
                        {/* {runs.map((run) => ( */}
                        {paginatedRuns.map((run) => (
                            <div
                                className={`history-card ${selectedRun?.id === run.id ? 'selected' : ''}`}
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
                                            className={`page-btn ${runPage === item ? 'active' : ''}`}
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
                                    onClick={() => setRunPage((p) => Math.min(totalRunPages, p + 1))}
                                >
                                    Next ›
                                </button>
                            </div>
                        )}
                    </div>

                    {selectedRun && (
                        <div className="history-detail">
                            <div className="history-detail-header">
                                <div>
                                    <h2>Run #{selectedRun.id} — Execution Trace</h2>
                                    <p>{selectedRun.problem}</p>
                                </div>

                                <button onClick={() => setSelectedRun(null)}>
                                    Close
                                </button>
                            </div>

                            {eventsLoading ? (
                                <p>Loading execution trace...</p>
                            ) : runEvents.length === 0 ? (
                                <p>No saved events found for this run.</p>
                            ) : (
                                <div className="history-events">
                                    {/* {runEvents.map((event) => ( */}
                                    {paginatedEvents.map((event) => (
                                        <div className="history-event" key={event.id}>
                                            <div className="history-event-heading">
                                                <strong>{event.event_type}</strong>
                                                <span>
                                                    {event.created_at
                                                        ? new Date(event.created_at).toLocaleString()
                                                        : ''}
                                                </span>
                                            </div>

                                            <pre>
                                                {JSON.stringify(event.payload, null, 2)}
                                            </pre>
                                        </div>
                                    ))}

                                    {totalEventPages > 1 && (
                                        <div className="history-pagination">
                                            <button
                                                type="button"
                                                className="page-btn nav-btn"
                                                disabled={eventPage === 1}
                                                onClick={() => setEventPage((p) => Math.max(1, p - 1))}
                                            >
                                                ‹ Prev
                                            </button>

                                            {getPageNumbers(eventPage, totalEventPages).map((item, idx) =>
                                                item === '...' ? (
                                                    <span key={`ev-dots-${idx}`} className="page-ellipsis">
                                                        ...
                                                    </span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        key={item}
                                                        className={`page-btn ${eventPage === item ? 'active' : ''}`}
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
                                                onClick={() => setEventPage((p) => Math.min(totalEventPages, p + 1))}
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