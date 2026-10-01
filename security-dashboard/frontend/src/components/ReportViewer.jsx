import React, { useEffect, useState } from 'react';
import { Download, Search } from 'lucide-react';
import PageHead from './PageHead';
import LogViewer, { RemoteLogViewer, lineStyle } from './LogViewer';

const statusBadge = (status) => (
    status === 'completed'
        ? <span className="badge badge-ok">Completed</span>
        : <span className="badge badge-crit">{status ? status[0].toUpperCase() + status.slice(1) : 'Failed'}</span>
);

// live: the scan started from this browser, if any: { scanId, type, label, logs, isScanning, startedAt, endedAt }
// active: scans running on the server (any browser), from /api/scans/active; labelFor maps scan_type to a label
export default function ReportViewer({ live, active = [], labelFor = (t) => t }) {
    const [reports, setReports] = useState([]);
    const [selectedReport, setSelectedReport] = useState(null);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    // Show the running scan by default when one is in progress.
    const [liveSelected, setLiveSelected] = useState(!!live?.isScanning);
    // A scan started elsewhere that is being followed; preselect one if nothing local is running.
    const [remoteId, setRemoteId] = useState(() => (!live?.isScanning && active[0] ? active[0].scan_id : null));

    useEffect(() => {
        fetchReports();
    }, []);

    // When the live scan finishes its report is saved; refresh the list so it appears.
    useEffect(() => {
        if (live && !live.isScanning) fetchReports();
    }, [live?.isScanning]);

    // The live row is shown until its saved report is in the list, then that report takes over.
    const liveSaved = live && reports.some(r => r.id === live.scanId);
    const showLive = live && !liveSaved;
    useEffect(() => {
        if (liveSaved && liveSelected) { setLiveSelected(false); loadReportDetails(live.scanId); }
    }, [liveSaved]);

    // Scans running on the server that are not this browser's own live scan and not saved yet.
    const remote = active.filter(r => r.scan_id !== live?.scanId && !reports.some(x => x.id === r.scan_id));
    // When a followed scan's report appears, switch to it; refresh the list whenever a run ends.
    useEffect(() => {
        if (remoteId && reports.some(r => r.id === remoteId)) { const id = remoteId; setRemoteId(null); loadReportDetails(id); }
    }, [reports]);
    useEffect(() => { fetchReports(); }, [active.length]);
    const pick = (kind, id) => { setLiveSelected(kind === 'live'); setRemoteId(kind === 'remote' ? id : null); if (kind !== 'report') setSelectedReport(null); };
    const runningCount = remote.length + (live?.isScanning ? 1 : 0);

    const fetchReports = async () => {
        try {
            const res = await fetch('/api/reports/');
            const data = await res.json();
            // Sort by timestamp desc
            data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            setReports(data);
        } catch (err) {
            console.error("Failed to fetch reports:", err);
        }
    };

    const loadReportDetails = async (id) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/reports/${id}`);
            const data = await res.json();
            setSelectedReport(data);
        } catch (err) {
            console.error("Failed to load report:", err);
        } finally {
            setLoading(false);
        }
    };

    const downloadJson = () => {
        const blob = new Blob([JSON.stringify(selectedReport, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `report-${selectedReport.id}.json`;
        a.click();
    };

    const filteredReports = reports.filter(r =>
        r.scan_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.id.includes(searchTerm)
    );

    return (
        <div className="flex-1 min-h-0 flex flex-col gap-3.5 px-7 pt-[18px] pb-6">
            <PageHead title="Event logs" sub="Output captured from each scan run" />

            <div className="flex-1 min-h-0 grid grid-cols-[380px_1fr] gap-[18px]">
                {/* Runs */}
                <section className="sheet flex flex-col min-h-0">
                    <div className="phead">
                        <h2>Runs <span className="count">{reports.length}</span></h2>
                        {runningCount > 0 && <span className="badge badge-run">{runningCount} running</span>}
                    </div>
                    <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--line)', background: 'var(--panel-head)' }}>
                        <label className="relative block">
                            <span className="sr-only">Filter reports</span>
                            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5" style={{ color: 'var(--faint)' }} />
                            <input type="text" className="inp h-[28px] pl-8" placeholder="Filter by scan type or ID" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                        </label>
                    </div>
                    <div className="grid grid-cols-[88px_1fr_auto] gap-3 px-3.5 py-2 text-[11px] font-bold tracking-[.06em] uppercase" style={{ background: 'var(--panel-head)', borderBottom: '1px solid var(--line)' }}>
                        <span>Started</span><span>Scan</span><span>Result</span>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {showLive && (
                            <button
                                type="button"
                                onClick={() => pick('live')}
                                aria-current={liveSelected ? 'true' : undefined}
                                className="w-full grid grid-cols-[88px_1fr_auto] gap-3 items-center px-3.5 py-[7px] text-left border-0 cursor-pointer hover:!bg-[var(--row-hover)]"
                                style={{ font: 'inherit', color: 'var(--ink)', borderBottom: '1px solid var(--line)', background: liveSelected ? 'var(--accent-tint)' : 'var(--panel)', boxShadow: liveSelected ? 'inset 3px 0 0 var(--accent-text)' : 'none' }}
                            >
                                <span className="num text-xs leading-4" style={{ color: 'var(--mute)' }}>
                                    {new Date(live.startedAt).toLocaleDateString([], { day: '2-digit', month: 'short' })}<br />
                                    {new Date(live.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <span className="min-w-0">
                                    <span className="block font-medium text-[13px] truncate">{live.type === 'all' ? 'Full scan' : live.type}</span>
                                    <span className="block num text-[10.5px]" style={{ color: 'var(--faint)' }}>{live.scanId.slice(0, 8)} · live</span>
                                </span>
                                {live.isScanning
                                    ? <span className="badge badge-run flex items-center gap-1.5"><span className="w-1.5 h-1.5 animate-pulse" style={{ background: 'currentColor' }} />Running</span>
                                    : <span className="badge badge-mute">Finished</span>}
                            </button>
                        )}
                        {remote.map(r => {
                            const on = remoteId === r.scan_id;
                            return (
                                <button
                                    key={r.scan_id}
                                    type="button"
                                    onClick={() => pick('remote', r.scan_id)}
                                    aria-current={on ? 'true' : undefined}
                                    className="w-full grid grid-cols-[88px_1fr_auto] gap-3 items-center px-3.5 py-[7px] text-left border-0 cursor-pointer hover:!bg-[var(--row-hover)]"
                                    style={{ font: 'inherit', color: 'var(--ink)', borderBottom: '1px solid var(--line)', background: on ? 'var(--accent-tint)' : 'var(--panel)', boxShadow: on ? 'inset 3px 0 0 var(--accent-text)' : 'none' }}
                                >
                                    <span className="num text-xs leading-4" style={{ color: 'var(--mute)' }}>
                                        {new Date(r.started_at).toLocaleDateString([], { day: '2-digit', month: 'short' })}<br />
                                        {new Date(r.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block font-medium text-[13px] truncate">{r.scan_type === 'all' ? 'Full scan' : r.scan_type}</span>
                                        <span className="block num text-[10.5px]" style={{ color: 'var(--faint)' }}>{r.scan_id.slice(0, 8)} · live</span>
                                    </span>
                                    <span className="badge badge-run flex items-center gap-1.5"><span className="w-1.5 h-1.5 animate-pulse" style={{ background: 'currentColor' }} />Running</span>
                                </button>
                            );
                        })}
                        {filteredReports.map((report, i) => {
                            const sel = !liveSelected && !remoteId && selectedReport?.id === report.id;
                            const d = new Date(report.timestamp);
                            return (
                                <button
                                    key={report.id}
                                    type="button"
                                    onClick={() => { pick('report'); loadReportDetails(report.id); }}
                                    aria-current={sel ? 'true' : undefined}
                                    className="w-full grid grid-cols-[88px_1fr_auto] gap-3 items-center px-3.5 py-[7px] text-left border-0 cursor-pointer hover:!bg-[var(--row-hover)]"
                                    style={{
                                        font: 'inherit',
                                        color: 'var(--ink)',
                                        borderBottom: '1px solid var(--line-soft)',
                                        background: sel ? 'var(--accent-tint)' : i % 2 ? 'var(--zebra)' : 'var(--panel)',
                                        boxShadow: sel ? 'inset 3px 0 0 var(--accent-text)' : 'none',
                                    }}
                                >
                                    <span className="num text-xs leading-4" style={{ color: 'var(--mute)' }}>
                                        {d.toLocaleDateString([], { day: '2-digit', month: 'short' })}<br />
                                        {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block font-medium text-[13px] truncate">{report.scan_type === 'all' ? 'Full scan' : report.scan_type || 'Unknown Scan'}</span>
                                        <span className="block num text-[10.5px]" style={{ color: 'var(--faint)' }}>{report.id.slice(0, 8)}</span>
                                    </span>
                                    {statusBadge(report.status)}
                                </button>
                            );
                        })}

                        {filteredReports.length === 0 && !showLive && remote.length === 0 && (
                            <p className="m-0 p-4 text-xs text-center" style={{ color: 'var(--mute)' }}>No reports found</p>
                        )}
                    </div>
                </section>

                {/* Report detail */}
                <section className="sheet flex flex-col min-h-0">
                    {remoteId && active.some(r => r.scan_id === remoteId) ? (
                        <RemoteLogViewer
                            scanId={remoteId}
                            scanLabel={labelFor(active.find(r => r.scan_id === remoteId).scan_type)}
                            startedAt={new Date(active.find(r => r.scan_id === remoteId).started_at).getTime()}
                            onDone={fetchReports}
                        />
                    ) : liveSelected && showLive ? (
                        <LogViewer logs={live.logs} isScanning={live.isScanning} scanLabel={live.label} scanId={live.scanId} startedAt={live.startedAt} endedAt={live.endedAt} />
                    ) : selectedReport ? (
                        <>
                            <div className="phead flex-wrap py-1.5">
                                <h2 className="capitalize">{selectedReport.request.scan_type === 'all' ? 'Full scan' : selectedReport.request.scan_type}</h2>
                                <span className="num text-[11px] px-1.5" style={{ border: '1px solid var(--line-strong)', color: 'var(--mute)' }}>{selectedReport.id.slice(0, 8)}</span>
                                <span className="meta">Scanned {new Date(selectedReport.timestamp).toLocaleString()}</span>
                                <div className="flex-1" />
                                {loading && <span className="meta">Loading…</span>}
                                <button type="button" className="btn h-[26px]" onClick={downloadJson}>
                                    <Download className="w-3 h-3" /> Download JSON
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto">
                                {selectedReport.results.map((res, idx) => {
                                    const lines = (res.output || '').split('\n')
                                        .map((text, i) => ({ text, i }));
                                    return (
                                        <div key={idx} style={{ borderBottom: '1px solid var(--line)' }}>
                                            <div className="flex items-center gap-2.5 px-3.5 py-2 sticky top-0 z-10" style={{ background: 'var(--panel-head)', borderBottom: '1px solid var(--line)' }}>
                                                <span className="text-[13px] font-semibold">{res.scan_type}</span>
                                                {statusBadge(res.status)}
                                                <span className="num text-[11px]" style={{ color: 'var(--mute-2)' }}>{lines.length} lines</span>
                                            </div>
                                            {!res.output ? (
                                                <p className="m-0 px-3.5 py-3 text-xs italic" style={{ color: 'var(--faint)' }}>No output captured for this scan section.</p>
                                            ) : (
                                                <div className="num text-xs leading-5 py-1.5">
                                                    {lines.map(l => (
                                                        <div key={l.i} className="grid grid-cols-[52px_1fr]" style={lineStyle(l.text)}>
                                                            <span className="text-right pr-3 mr-3 select-none" style={{ color: 'var(--faint)', borderRight: '1px solid var(--line-soft)', background: 'var(--panel)' }}>{l.i + 1}</span>
                                                            <span className="pr-3.5" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{l.text}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
                            <div className="font-serif text-lg" style={{ color: 'var(--ink)' }}>{loading ? 'Loading report…' : 'Select a run'}</div>
                            <p className="mt-1 text-xs max-w-sm" style={{ color: 'var(--mute)' }}>
                                Pick a run from the list to read its captured output and download the full report.
                            </p>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
