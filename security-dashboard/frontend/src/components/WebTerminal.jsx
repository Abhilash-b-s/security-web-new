import React, { useState, useEffect, useRef } from 'react';
import { Send, X } from 'lucide-react';
import PageHead from './PageHead';

export default function WebTerminal({ onClose }) {
    const [output, setOutput] = useState('');
    const [command, setCommand] = useState('');
    const [error, setError] = useState(null);
    const [history, setHistory] = useState([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [isConnected, setIsConnected] = useState(false);
    const wsRef = useRef(null);
    const endRef = useRef(null);

    useEffect(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const token = JSON.parse(localStorage.getItem('user') || 'null')?.token;
        const wsUrl = `${protocol}//${window.location.host}/api/terminal/ws?token=${encodeURIComponent(token)}`;
        let retryTimer;
        let wasOpen = false;

        // Reconnect on drop: a redeploy (Recreate strategy) kills the socket while the page stays loaded.
        const connect = () => {
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                wasOpen = true;
                setIsConnected(true);
                setOutput(prev => prev + "--- Terminal Connected ---\n");
            };

            ws.onmessage = (event) => {
                const message = event.data;
                setOutput(prev => prev + message);
            };

            ws.onclose = () => {
                // Ignore a stale socket closing after its replacement opened (StrictMode double effect / unmount).
                if (wsRef.current !== ws) return;
                setIsConnected(false);
                if (wasOpen) setOutput(prev => prev + "\n--- Terminal Disconnected, reconnecting... ---\n");
                wasOpen = false;
                retryTimer = setTimeout(connect, 3000);
            };
        };
        connect();

        return () => {
            clearTimeout(retryTimer);
            const ws = wsRef.current;
            wsRef.current = null;
            if (ws) ws.close();
        };
    }, []);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [output]);

    const handleSend = (e) => {
        e.preventDefault();
        if (!command.trim()) return;
        if (wsRef.current?.readyState !== WebSocket.OPEN) {
            setError('Terminal is not connected yet, retrying...');
            return;
        }

        // Mirrors the server rule (services/terminal.py), which is the one that is enforced.
        if (!/^kubectl\s+get(\s|$)/.test(command.trim())) {
            setError("Only 'kubectl get' commands are allowed");
            return;
        }

        setError(null);
        setOutput(prev => prev + `$ ${command}\n`);
        wsRef.current.send(command);
        setHistory(prev => [...prev, command]);
        setHistoryIndex(-1);
        setCommand('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (history.length === 0) return;
            const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
            setHistoryIndex(newIndex);
            setCommand(history[newIndex]);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyIndex === -1) return;
            const newIndex = historyIndex + 1;
            if (newIndex >= history.length) {
                setHistoryIndex(-1);
                setCommand('');
            } else {
                setHistoryIndex(newIndex);
                setCommand(history[newIndex]);
            }
        }
    };

    const QUICK = ['kubectl get pods -A', 'kubectl get nodes -o wide', 'kubectl get policyreports -A', 'kubectl get clusterpolicies', 'kubectl get events -A'];

    return (
        <div className="flex-1 min-h-0 flex flex-col gap-3.5 px-7 pt-[18px] pb-6">
            <PageHead title="Terminal" sub="Read-only kubectl get against the cluster the dashboard runs in">
                <button type="button" className="btn" onClick={() => setOutput('')}>Clear</button>
            </PageHead>

            <div className="flex-1 min-h-0 grid grid-cols-[1fr_300px] gap-[18px]">
                <section className="sheet flex flex-col min-h-0" style={{ borderColor: 'var(--term-line)' }}>
                    <div className="phead" style={{ background: 'var(--term-head)', borderBottomColor: 'var(--term-line)' }}>
                        <h2 style={{ color: '#E9E7E1' }}>kubectl</h2>
                        <div className="flex-1" />
                        <span className="flex items-center gap-1.5 text-xs" style={{ color: '#E6E4DF' }}>
                            <span className="w-1.5 h-1.5" style={{ background: isConnected ? '#5FA36F' : '#C25B5B' }} />
                            {isConnected ? 'Connected' : 'Disconnected'}
                        </span>
                        {onClose && (
                            <button type="button" onClick={onClose} className="btn h-[26px]" style={{ background: 'transparent', color: '#E9E7E1', borderColor: 'var(--term-line)' }} title="Close terminal">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    <div className="flex-1 overflow-auto px-4 py-3 num text-[12.5px] leading-[19px] whitespace-pre" style={{ background: 'var(--term)', color: 'var(--term-ink)' }}>
                        {output || <span className="italic" style={{ color: '#D2D0CB' }}>Ready. Type a kubectl command below.</span>}
                        <div ref={endRef} />
                    </div>

                    <div className="shrink-0 px-3.5 py-2.5" style={{ background: 'var(--term-head)', borderTop: '1px solid var(--term-line)' }}>
                        {error && <div className="num text-xs mb-1.5" style={{ color: '#E58C8C' }} role="alert">{error}</div>}
                        <form onSubmit={handleSend} className="flex gap-2.5 items-center">
                            <label htmlFor="term-cmd" className="num text-[12.5px] select-none" style={{ color: '#7FA3D6' }}>$</label>
                            <input
                                id="term-cmd"
                                type="text"
                                value={command}
                                onChange={(e) => { setCommand(e.target.value); if (error) setError(null); }}
                                onKeyDown={handleKeyDown}
                                className="inp mono flex-1"
                                style={{ background: 'var(--term)', color: '#E9E7E1', borderColor: 'var(--term-line)' }}
                                placeholder="kubectl get pods -A"
                                autoFocus
                            />
                            <span className="num text-[11px] hidden lg:inline" style={{ color: '#D2D0CB' }}>↑↓ history</span>
                            <button type="submit" disabled={!isConnected} className="btn btn-primary">
                                <Send className="w-3.5 h-3.5" /> Run
                            </button>
                        </form>
                    </div>
                </section>

                <aside className="flex flex-col gap-3.5 min-h-0">
                    <section className="sheet">
                        <div className="phead"><h2>Quick commands</h2></div>
                        <div className="flex flex-col gap-[5px] p-3">
                            {QUICK.map(q => (
                                <button key={q} type="button" className="navlink num !m-0 !w-full text-xs" onClick={() => { setCommand(q); setError(null); document.getElementById('term-cmd')?.focus(); }}>
                                    <span style={{ color: 'var(--faint)' }}>$</span>{q}
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="sheet flex-1 min-h-0 flex flex-col">
                        <div className="phead"><h2>History <span className="count">{history.length}</span></h2></div>
                        {history.length === 0 ? (
                            <p className="m-0 px-3.5 py-2.5 text-xs" style={{ color: 'var(--mute)' }}>Commands you run appear here.</p>
                        ) : (
                            <ol className="m-0 px-3.5 py-1.5 list-none overflow-y-auto num text-xs leading-6">
                                {[...history].reverse().map((h, i) => (
                                    <li key={i}>
                                        <button type="button" className="lnk num truncate max-w-full text-left" style={{ color: 'var(--ink-2)' }} onClick={() => setCommand(h)}>{h}</button>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </section>
                </aside>
            </div>
        </div>
    );
}
