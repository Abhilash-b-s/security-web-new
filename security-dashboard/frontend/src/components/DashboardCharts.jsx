import { useState, useEffect } from 'react';
import { AlertTriangle, Download } from 'lucide-react';
import PageHead from './PageHead';
import HistoryCharts, { computeSecurityScore } from './HistoryCharts';

const SEV = [
    { key: 'CRITICAL', label: 'Critical', color: 'var(--crit)' },
    { key: 'HIGH', label: 'High', color: 'var(--high)' },
    { key: 'MEDIUM', label: 'Medium', color: 'var(--medium)' },
    { key: 'LOW', label: 'Low', color: 'var(--low)' },
];

const VULN_SOURCES = [
    { key: 'trivyImage', name: 'Image vulnerabilities', tool: 'trivy' },
    { key: 'trivySbom', name: 'SBOM inventory', tool: 'trivy' },
    { key: 'cluster', name: 'Cluster risks', tool: 'trivy' },
    { key: 'trivyRepo', name: 'Source code', tool: 'trivy' },
];

function getScoreStyle(score) {
    if (score >= 80) return { color: 'var(--ok)', label: 'Good' };
    if (score >= 60) return { color: 'var(--warn)', label: 'Fair' };
    if (score >= 40) return { color: 'var(--high-text)', label: 'Poor' };
    return { color: 'var(--crit)', label: 'Critical' };
}

function rateColor(rate) {
    if (rate === null) return 'var(--faint)';
    if (rate >= 80) return 'var(--ok)';
    if (rate >= 60) return 'var(--warn)';
    return 'var(--crit)';
}

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : null);

function Figure({ label, value, unit, color, note }) {
    return (
        <div className="px-4 py-3" style={{ borderLeft: '1px solid var(--line-soft)' }}>
            <div className="text-[11px] font-medium" style={{ color: 'var(--mute)' }}>{label}</div>
            <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="num text-[22px] leading-[34px] font-medium" style={{ color: color || 'var(--ink)' }}>{value}</span>
                {unit && <span className="text-xs" style={{ color: 'var(--mute)' }}>{unit}</span>}
            </div>
            {note && <div className="text-[11px] mt-0.5" style={{ color: 'var(--mute-2)' }}>{note}</div>}
        </div>
    );
}

function StackBar({ parts, width = 180 }) {
    const total = parts.reduce((a, p) => a + p.value, 0);
    return (
        <div className="flex gap-px h-2" style={{ width, background: 'var(--line-soft)' }}>
            {total > 0 && parts.map(p => p.value > 0 && (
                <div key={p.key} title={`${p.label}: ${p.value}`} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
            ))}
        </div>
    );
}

function Legend() {
    return (
        <div className="flex gap-3 text-[11px]" style={{ color: 'var(--mute)' }}>
            {SEV.map(s => (
                <span key={s.key} className="flex items-center gap-1.5"><span className="w-2 h-2 inline-block" style={{ background: s.color }} />{s.label}</span>
            ))}
        </div>
    );
}

function timeAgo(ts) {
    const d = new Date(ts);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    return sameDay
        ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
        : d.toLocaleDateString([], { day: '2-digit', month: 'short' });
}

export default function DashboardCharts() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [recent, setRecent] = useState([]);
    const [dashboardData, setDashboardData] = useState({
        kyverno: { counts: {}, total: 0, available: false },
        trivyImage: { counts: {}, total: 0, available: false },
        trivySbom: { counts: {}, total: 0, available: false },
        trivyRepo: { counts: {}, total: 0, available: false },
        nmap: { total: 0, servicesWithWeakCiphers: 0, available: false },
        kubebench: { counts: {}, total: 0, available: false },
        cluster: { counts: {}, total: 0, available: false },
    });

    useEffect(() => { loadAllData(); loadRecent(); }, []);

    const loadAllData = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/dashboard/stats');
            if (!res.ok) throw new Error('Failed to load dashboard data');
            setDashboardData(await res.json());
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const loadRecent = async () => {
        try {
            const res = await fetch('/api/reports/');
            if (!res.ok) return;
            const data = await res.json();
            data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            setRecent(data.slice(0, 8));
        } catch {
            // Recent activity is optional; the overview still renders without it.
        }
    };

    const head = <PageHead eyebrow="Security posture" title="Overview" sub="Latest report of each scanner" />;

    if (loading) {
        return (
            <div className="flex flex-col gap-3.5">
                {head}
                <div className="sheet px-4 py-10 text-center text-xs" style={{ color: 'var(--mute)' }}>Loading security data…</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col gap-3.5">
                {head}
                <div className="note note-warn">
                    <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={1.8} />
                    <div>
                        <div className="font-semibold">Dashboard unavailable</div>
                        <div>Run scans to generate reports and view the overview.</div>
                    </div>
                </div>
            </div>
        );
    }

    const hasAnyData = Object.values(dashboardData).some(v => v.available === true);
    if (!hasAnyData) {
        return (
            <div className="flex flex-col gap-3.5">
                {head}
                <HistoryCharts />
                <section className="sheet">
                    <div className="phead"><h2>No scan data yet</h2></div>
                    <p className="px-3.5 py-3 m-0 text-[13px] max-w-xl" style={{ color: 'var(--mute)' }}>
                        Run your first scan from <b style={{ color: 'var(--ink)' }}>Run a scan</b> in the left panel. Findings, compliance results and recent runs appear here once a report exists.
                    </p>
                </section>
            </div>
        );
    }

    const exportSummary = () => {
        const url = URL.createObjectURL(new Blob([JSON.stringify({ exported_at: new Date().toISOString(), ...dashboardData }, null, 2)], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `security-summary-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ── Derived values ───────────────────────────────────────────────────────
    const d = dashboardData;
    const securityScore = computeSecurityScore(d);
    const scoreStyle = securityScore !== null ? getScoreStyle(securityScore) : null;

    const vulnKeys = ['trivyImage', 'trivySbom', 'trivyRepo', 'cluster'];
    const sumSev = (sev) => vulnKeys.reduce((a, k) => a + (d[k].counts[sev] || 0), 0);
    const totalCritical = sumSev('CRITICAL');
    const totalHigh = sumSev('HIGH');

    const policyPassRate = d.kyverno.available ? pct(d.kyverno.counts.PASS || 0, d.kyverno.total) : null;
    const cisPassRate = d.kubebench.available ? pct(d.kubebench.counts.PASS || 0, d.kubebench.total) : null;

    const vulnRows = VULN_SOURCES.map(s => {
        const src = d[s.key];
        const c = src.counts || {};
        return { ...s, available: src.available, total: src.total, c, parts: SEV.map(v => ({ ...v, value: c[v.key] || 0 })) };
    });
    const availableVuln = vulnRows.filter(r => r.available);

    const compRows = [
        {
            name: 'Policy compliance', tool: 'kyverno', available: d.kyverno.available, total: d.kyverno.total,
            pass: d.kyverno.counts.PASS || 0, warn: d.kyverno.counts.WARN || 0, fail: d.kyverno.counts.FAIL || 0,
            other: (d.kyverno.counts.ERROR || 0) + (d.kyverno.counts.SKIP || 0), otherLabel: 'error / skip',
        },
        {
            name: 'CIS benchmark', tool: 'kube-bench', available: d.kubebench.available, total: d.kubebench.total,
            pass: d.kubebench.counts.PASS || 0, warn: d.kubebench.counts.WARN || 0, fail: d.kubebench.counts.FAIL || 0,
            other: d.kubebench.counts.INFO || 0, otherLabel: 'info',
        },
        {
            name: 'Network exposure', tool: 'nmap', available: d.nmap.available, total: d.nmap.total,
            pass: d.nmap.total - d.nmap.servicesWithWeakCiphers, warn: null, fail: d.nmap.servicesWithWeakCiphers,
            other: null, unit: 'services scanned',
        },
    ];

    const dash = <span style={{ color: 'var(--faint)' }}>—</span>;
    const sevCell = (n, key) => {
        if (key === 'CRITICAL' && n > 0) return { color: 'var(--crit)', background: 'var(--crit-tint)', fontWeight: 600 };
        if (key === 'HIGH' && n > 0) return { color: 'var(--high-text)', background: 'var(--high-tint)' };
        if (!n) return { color: 'var(--faint)' };
        return {};
    };

    return (
        <div className="flex flex-col gap-[18px]">
            <PageHead eyebrow="Security posture" title="Overview" sub="Trends from daily scan history, then the latest report of each scanner">
                <button type="button" className="btn" onClick={exportSummary}><Download className="w-3 h-3" /> Export summary</button>
            </PageHead>

            <HistoryCharts />

            <div className="flex items-baseline gap-3 mt-2 pt-4" style={{ borderTop: '1px solid var(--line)' }}>
                <h2 className="m-0 text-[15px] font-semibold">Latest reports</h2>
                <span className="page-sub">Current numbers from the most recent report of each scanner</span>
            </div>

            {/* Headline figures */}
            <div className="sheet grid grid-cols-2 md:grid-cols-3 xl:grid-cols-[1.35fr_repeat(5,minmax(0,1fr))]">
                <div className="px-[18px] py-3 col-span-2 md:col-span-1">
                    <div className="text-[11px] font-medium" style={{ color: 'var(--mute)' }}>Security score</div>
                    {securityScore !== null ? (
                        <>
                            <div className="flex items-baseline gap-2 mt-0.5">
                                <span className="num text-[30px] leading-[34px] font-medium">{securityScore}</span>
                                <span className="text-xs" style={{ color: 'var(--mute)' }}>/ 100</span>
                                <span className="text-xs font-medium" style={{ color: scoreStyle.color }}>{scoreStyle.label}</span>
                            </div>
                            <div className="relative mt-2 h-1.5 flex">
                                <div className="w-[40%]" style={{ background: 'var(--crit-line)' }} />
                                <div className="w-[20%]" style={{ background: 'var(--high-tint)' }} />
                                <div className="w-[20%]" style={{ background: 'var(--warn-line)' }} />
                                <div className="w-[20%]" style={{ background: 'var(--ok-line)' }} />
                                <div className="absolute -top-[3px] w-0.5 h-3" style={{ left: `${securityScore}%`, background: 'var(--ink)' }} />
                            </div>
                            <div className="num flex justify-between mt-[3px] text-[10px]" style={{ color: 'var(--faint)' }}><span>0</span><span>40</span><span>60</span><span>80</span><span>100</span></div>
                        </>
                    ) : (
                        <div className="num text-[30px] leading-[34px]" style={{ color: 'var(--faint)' }}>N/A</div>
                    )}
                </div>
                <Figure label="Critical findings" value={totalCritical} unit="open" color={totalCritical > 0 ? 'var(--crit)' : undefined} note="Image, SBOM, repo and cluster" />
                <Figure label="High findings" value={totalHigh} unit="open" note="Same sources" />
                <Figure label="Policy pass rate" value={policyPassRate !== null ? policyPassRate : '—'} unit={policyPassRate !== null ? '%' : ''} color={rateColor(policyPassRate)}
                    note={d.kyverno.available ? `${d.kyverno.counts.PASS || 0} of ${d.kyverno.total} checks` : 'No data'} />
                <Figure label="CIS pass rate" value={cisPassRate !== null ? cisPassRate : '—'} unit={cisPassRate !== null ? '%' : ''} color={rateColor(cisPassRate)}
                    note={d.kubebench.available ? `${d.kubebench.counts.PASS || 0} of ${d.kubebench.total} checks` : 'No data'} />
                <Figure label="Weak-cipher services" value={d.nmap.available ? d.nmap.servicesWithWeakCiphers : '—'} unit={d.nmap.available ? `of ${d.nmap.total}` : ''}
                    color={d.nmap.available && d.nmap.servicesWithWeakCiphers > 0 ? 'var(--warn)' : undefined} note={d.nmap.available ? 'From the last network scan' : 'No data'} />
            </div>

            {/* Vulnerabilities by scanner */}
            <section className="sheet">
                <div className="phead flex-wrap">
                    <h2>Vulnerabilities by scanner <span className="count">{availableVuln.reduce((a, r) => a + r.total, 0)}</span></h2>
                    <span className="meta">Findings in the latest report of each scanner</span>
                    <div className="flex-1" />
                    <Legend />
                </div>
                <div className="overflow-x-auto">
                    <table className="ctable">
                        <thead><tr>
                            <th>Scanner</th>
                            <th className="r w-[80px]">Critical</th><th className="r w-[64px]">High</th><th className="r w-[72px]">Medium</th><th className="r w-[56px]">Low</th><th className="r w-[80px]">Unknown</th><th className="r w-[64px]">Total</th>
                            <th className="w-[212px] !pl-4">Distribution</th><th className="w-[110px]">Result</th>
                        </tr></thead>
                        <tbody>
                            {vulnRows.map(r => (
                                <tr key={r.key}>
                                    <td className="whitespace-nowrap"><span className="font-medium">{r.name}</span><span className="tool">{r.tool}</span></td>
                                    {r.available ? (
                                        <>
                                            {SEV.map(s => <td key={s.key} className="r num" style={sevCell(r.c[s.key] || 0, s.key)}>{r.c[s.key] || 0}</td>)}
                                            <td className="r num" style={{ color: 'var(--mute)' }}>{r.c.UNKNOWN || 0}</td>
                                            <td className="r num font-semibold">{r.total}</td>
                                            <td className="!pl-4"><StackBar parts={r.parts} width={196} /></td>
                                            <td>{(r.c.CRITICAL || 0) > 0
                                                ? <span className="badge badge-crit">Critical</span>
                                                : (r.c.HIGH || 0) > 0 ? <span className="badge badge-warn">High</span>
                                                    : <span className="badge badge-ok">Clean</span>}</td>
                                        </>
                                    ) : (
                                        <>
                                            <td className="r num">{dash}</td><td className="r num">{dash}</td><td className="r num">{dash}</td><td className="r num">{dash}</td><td className="r num">{dash}</td><td className="r num">{dash}</td>
                                            <td className="!pl-4"><StackBar parts={[]} width={196} /></td>
                                            <td><span className="badge badge-mute">No report</span></td>
                                        </>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                        <tfoot><tr>
                            <td>Total <span className="font-normal" style={{ color: 'var(--mute)' }}>· {availableVuln.length} of {vulnRows.length} scanners</span></td>
                            {SEV.map(s => <td key={s.key} className="r num" style={s.key === 'CRITICAL' && totalCritical ? { color: 'var(--crit)' } : undefined}>{sumSev(s.key)}</td>)}
                            <td className="r num">{sumSev('UNKNOWN')}</td>
                            <td className="r num">{availableVuln.reduce((a, r) => a + r.total, 0)}</td>
                            <td /><td />
                        </tr></tfoot>
                    </table>
                </div>
            </section>

            <div className="grid grid-cols-1 xl:grid-cols-[1.55fr_1fr] gap-[18px]">
                {/* Compliance */}
                <section className="sheet">
                    <div className="phead">
                        <h2>Compliance checks</h2>
                        <span className="meta">Policies, CIS benchmark and network ciphers</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="ctable">
                            <thead><tr>
                                <th>Check</th><th className="r">Pass</th><th className="r">Warn</th><th className="r">Fail</th><th className="r">Other</th><th className="r">Total</th><th className="w-[170px]">Pass rate</th>
                            </tr></thead>
                            <tbody>
                                {compRows.map(r => {
                                    const rate = r.available ? pct(r.pass, r.total) : null;
                                    return (
                                        <tr key={r.name}>
                                            <td className="whitespace-nowrap"><span className="font-medium">{r.name}</span><span className="tool">{r.tool}</span></td>
                                            {r.available ? (
                                                <>
                                                    <td className="r num" style={{ color: 'var(--ok)' }}>{r.pass}</td>
                                                    <td className="r num" style={r.warn ? { color: 'var(--warn)' } : { color: 'var(--faint)' }}>{r.warn === null ? '—' : r.warn}</td>
                                                    <td className="r num" style={r.fail ? { color: 'var(--crit)', background: 'var(--crit-tint)', fontWeight: 600 } : { color: 'var(--faint)' }}>{r.fail}</td>
                                                    <td className="r num" style={{ color: 'var(--mute)' }} title={r.otherLabel}>{r.other === null ? '—' : r.other}</td>
                                                    <td className="r num font-semibold" title={r.unit}>{r.total}</td>
                                                    <td>
                                                        <div className="flex items-center gap-2">
                                                            <div className="h-2 w-[110px]" style={{ background: 'var(--line-soft)' }}>
                                                                <div className="h-full" style={{ width: `${rate || 0}%`, background: rateColor(rate) }} />
                                                            </div>
                                                            <span className="num text-xs" style={{ color: rateColor(rate) }}>{rate}%</span>
                                                        </div>
                                                    </td>
                                                </>
                                            ) : (
                                                <>
                                                    <td className="r num">{dash}</td><td className="r num">{dash}</td><td className="r num">{dash}</td><td className="r num">{dash}</td><td className="r num">{dash}</td>
                                                    <td><span className="badge badge-mute">No report</span></td>
                                                </>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Recent activity */}
                <section className="sheet">
                    <div className="phead">
                        <h2>Recent activity <span className="count">{recent.length}</span></h2>
                        <span className="meta">Latest reports</span>
                    </div>
                    {recent.length === 0 ? (
                        <p className="m-0 px-3.5 py-3 text-xs" style={{ color: 'var(--mute)' }}>No reports yet.</p>
                    ) : (
                        <ol className="m-0 px-3.5 pt-1 pb-1.5 list-none">
                            {recent.map(r => {
                                const ok = r.status === 'completed';
                                return (
                                    <li key={r.id} className="grid grid-cols-[52px_12px_1fr_auto] items-center gap-2.5 py-[5px] text-[13px]" style={{ borderBottom: '1px dotted var(--line)' }}>
                                        <span className="num text-xs" style={{ color: 'var(--mute-2)' }}>{timeAgo(r.timestamp)}</span>
                                        <span className="w-[7px] h-[7px]" style={{ background: ok ? 'var(--ok)' : 'var(--crit)' }} />
                                        <span className="truncate">{r.scan_type || 'Unknown scan'}</span>
                                        <span className="text-xs font-medium" style={{ color: ok ? 'var(--ok)' : 'var(--crit)' }}>{r.status || '—'}</span>
                                    </li>
                                );
                            })}
                        </ol>
                    )}
                </section>
            </div>
        </div>
    );
}
