import React, { useEffect, useRef, useState } from 'react';
import { Copy, Check, Download } from 'lucide-react';

// Colour per line, same rules as before.
export const lineLevel = (line) => (line.startsWith('Error') || line.includes('Failed') ? 'error' : line.includes('⚠') || line.includes('WARN') ? 'warn' : 'info');

export function lineStyle(line) {
    if (line.startsWith('$')) return { color: 'var(--warn)', fontWeight: 600 };
    if (line.startsWith('Error') || line.includes('Failed')) return { color: 'var(--crit)', background: 'var(--crit-tint)' };
    if (line.includes('===') || line.includes('---')) return { color: 'var(--accent-text)', fontWeight: 600 };
    if (line.includes('SUCCESS') || line.includes('✓')) return { color: 'var(--ok)' };
    if (line.includes('⚠') || line.includes('WARN')) return { color: 'var(--warn)', background: 'var(--warn-tint)' };
    return { color: 'var(--ink-2)' };
}

const elapsed = (from, to) => {
    const sec = Math.max(0, Math.floor(((to || Date.now()) - from) / 1000));
    return `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, '0')}s`;
};

// Live output of the current scan, shown inside the Event logs detail pane.
export default function LogViewer({ logs, isScanning, scanLabel, scanId, startedAt, endedAt }) {
    const scrollRef = useRef(null);
    const [copied, setCopied] = useState(false);
    const [follow, setFollow] = useState(true);
    const [, tick] = useState(0);

    useEffect(() => {
        if (!isScanning) return;
        const id = setInterval(() => tick(n => n + 1), 1000);
        return () => clearInterval(id);
    }, [isScanning]);

    useEffect(() => {
        if (follow && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs, follow]);

    const handleCopy = () => {
        const text = logs.join('\n');
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
        const text = logs.join('\n');
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `scan-logs-${new Date().toISOString()}.txt`;
        a.click();
    };

    return (
        <>
            <div className="phead flex-wrap py-1.5">
                <h2>{scanLabel || 'Scan output'} <span className="count">{logs.length}</span></h2>
                {isScanning
                    ? <span className="badge badge-run">Running</span>
                    : <span className="badge badge-mute">Finished</span>}
                {startedAt && <span className="meta num">started {new Date(startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })} · {elapsed(startedAt, isScanning ? null : endedAt)}</span>}
                <div className="flex-1" />
                <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--ink-2)' }}>
                    <input type="checkbox" checked={follow} onChange={e => setFollow(e.target.checked)} /> Follow output
                </label>
                <button type="button" className="btn h-[26px]" onClick={handleCopy} title="Copy All">
                    {copied ? <Check className="w-3 h-3" style={{ color: 'var(--ok)' }} /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied' : 'Copy'}
                </button>
                <button type="button" className="btn h-[26px]" onClick={handleDownload} title="Download Logs">
                    <Download className="w-3 h-3" /> Download .txt
                </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto py-1.5 num text-xs leading-5">
                {logs.length === 0 ? (
                    <div className="h-full flex items-center justify-center" style={{ color: 'var(--faint)' }}>
                        Waiting for scan initialization...
                    </div>
                ) : (
                    logs.map((log, i) => (
                        <div key={i} className="grid grid-cols-[52px_1fr] hover:bg-[var(--row-hover)]" style={lineStyle(log)}>
                            <span className="text-right pr-3 mr-3 select-none" style={{ color: 'var(--faint)', borderRight: '1px solid var(--line-soft)', background: 'var(--panel)' }}>{i + 1}</span>
                            <span className="pr-3.5" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{log.replace(/\t/g, '  ')}</span>
                        </div>
                    ))
                )}
            </div>

            <div className="num flex items-center gap-4 px-3.5 py-[7px] text-[11px]" style={{ borderTop: '1px solid var(--line)', background: 'var(--panel-head)', color: 'var(--mute)' }}>
                <span className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 ${isScanning ? 'animate-pulse' : ''}`} style={{ background: isScanning ? 'var(--ok)' : 'var(--faint)' }} />
                    {isScanning ? 'Receiving output' : 'Stream closed'}
                </span>
                {scanId && <span>scan_id {scanId.slice(0, 8)}</span>}
                <span className="ml-auto">{isScanning ? 'The report is saved when the scan finishes' : 'Report saved to Event logs'}</span>
            </div>
        </>
    );
}

// Follows a scan running on the server (started from any browser): the backend replays
// everything so far, then streams new lines until "__EOF__".
export function RemoteLogViewer({ scanId, scanLabel, startedAt, onDone }) {
    const [logs, setLogs] = useState([]);
    const [running, setRunning] = useState(true);
    const [endedAt, setEndedAt] = useState(null);

    useEffect(() => {
        setLogs([]);
        setRunning(true);
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/api/scans/ws/${scanId}`);
        ws.onmessage = (event) => {
            if (event.data === '__EOF__') {
                setRunning(false);
                setEndedAt(Date.now());
                ws.close();
                onDone?.(scanId);
                return;
            }
            const lines = event.data.replace(/\n$/, '').split('\n').filter(l => l.trim());
            if (lines.length) setLogs(prev => [...prev, ...lines]);
        };
        return () => ws.close();
    }, [scanId]);

    return <LogViewer logs={logs} isScanning={running} scanLabel={scanLabel} scanId={scanId} startedAt={startedAt} endedAt={endedAt} />;
}
