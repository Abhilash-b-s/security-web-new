import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useCluster, apiUrl } from '../cluster';

// ── Shared helpers ─────────────────────────────────────────────────────────

/**
 * Parts of the security score, each 0–100 (higher is better), as shares of what was scanned so the
 * score does not bottom out on large clusters. A half-weight item counts as half a bad one.
 * Snapshots from before the image/pod breakdown existed have no score.
 */
export function securityScoreParts(data) {
    if (!data || (data.trivyImage?.images == null && data.kyverno?.pods == null)) return [];
    const share = (bad, total) => Math.max(0, 100 - (bad / total) * 100);
    const parts = [];
    const img = data.trivyImage;
    if (img?.images > 0) parts.push({
        key: 'images', label: 'Images', weight: 40, score: share(img.imagesFixableCritical + img.imagesFixableHigh / 2, img.images),
        note: `${img.imagesFixableCritical} of ${img.images} with a fixable critical CVE, ${img.imagesFixableHigh} more with a fixable high`,
    });
    const k = data.kyverno;
    if (k?.pods > 0) parts.push({
        key: 'workloads', label: 'Workloads', weight: 30, score: share(k.podsBaselineFail + k.podsRestrictedFail / 2, k.pods),
        note: `${k.podsBaselineFail} of ${k.pods} pods fail Baseline pod security, ${k.podsRestrictedFail} more only Restricted · ${k.privileged} privileged, ${k.notNonRoot} not declared non-root`,
    });
    const kb = data.kubebench;
    if (kb?.available && kb.total > 0) parts.push({
        key: 'cis', label: 'CIS benchmark', weight: 20, score: ((kb.counts.PASS || 0) / kb.total) * 100,
        note: `${kb.counts.PASS || 0} of ${kb.total} checks pass`,
    });
    const n = data.nmap;
    if (n?.available && n.total > 0) parts.push({
        key: 'network', label: 'Network', weight: 10, score: share(n.servicesWithWeakCiphers, n.total),
        note: `${n.servicesWithWeakCiphers} of ${n.total} services offer weak ciphers`,
    });
    return parts;
}

export function computeSecurityScore(data) {
    const parts = securityScoreParts(data);
    const weight = parts.reduce((a, p) => a + p.weight, 0);
    return weight ? Math.round(parts.reduce((a, p) => a + p.score * p.weight, 0) / weight) : null;
}

const VULN_SOURCES = [
    { key: 'trivyImage', name: 'Image', color: 'var(--viz-s1)' },
    { key: 'cluster', name: 'Cluster', color: 'var(--viz-s2)' },
    { key: 'trivySbom', name: 'SBOM', color: 'var(--viz-s3)' },
    { key: 'trivyRepo', name: 'Repo', color: 'var(--viz-s4)' },
];
const SEVERITIES = [
    { key: 'CRITICAL', label: 'Critical', color: 'var(--viz-crit)' },
    { key: 'HIGH', label: 'High', color: 'var(--viz-high)' },
    { key: 'MEDIUM', label: 'Medium', color: 'var(--viz-medium)' },
    { key: 'LOW', label: 'Low', color: 'var(--viz-low)' },
];
const HEAT_ROWS = [
    ['trivy-image', 'Image vulnerabilities'], ['trivy-sbom', 'SBOM inventory'], ['trivy-cluster', 'Cluster risks'], ['trivy-compliance', 'Compliance'],
    ['kube-bench', 'CIS benchmark'], ['kyverno', 'Policy compliance'], ['nmap', 'Network exposure'], ['trivy-repo', 'Source code'],
];
const HEAT_FILL = ['var(--viz-h0)', 'var(--viz-h1)', 'var(--viz-h2)', 'var(--viz-h3)', 'var(--viz-h4)'];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (iso) => { const [, m, d] = iso.split('-'); return `${Number(d)} ${MONTHS[Number(m) - 1]}`; };
const fmt = (v) => (v == null ? '—' : Math.round(v).toLocaleString('en-US'));
const lastVal = (arr) => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i]; return null; };
const firstVal = (arr) => arr.find(v => v != null) ?? null;
const niceMax = (v) => {
    if (!v || v <= 0) return 1;
    const p = 10 ** Math.floor(Math.log10(v));
    return [1, 2, 2.5, 5, 10].map(m => m * p).find(m => m >= v);
};

// Metric extractors (stats may be null on days before history started)
const sevTotal = (st, k) => (st ? VULN_SOURCES.reduce((a, s) => a + (st[s.key]?.available ? (st[s.key].counts?.[k] || 0) : 0), 0) : null);
const critOf = (st, key) => (st && st[key]?.available ? (st[key].counts?.CRITICAL || 0) : null);
const rate = (x) => (x?.available && x.total > 0 ? ((x.counts?.PASS || 0) / x.total) * 100 : null);

function useWidth(initial = 600) {
    const ref = useRef(null);
    const [w, setW] = useState(initial);
    useEffect(() => {
        if (!ref.current) return;
        const ro = new ResizeObserver(entries => setW(Math.max(200, entries[0].contentRect.width)));
        ro.observe(ref.current);
        return () => ro.disconnect();
    }, []);
    return [ref, w];
}

// Path through values, broken at nulls
function linePath(values, x, y) {
    let d = '', pen = false;
    values.forEach((v, i) => {
        if (v == null) { pen = false; return; }
        d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
        pen = true;
    });
    return d.trim();
}

// ── Building blocks ────────────────────────────────────────────────────────

function Tooltip({ x, y, children }) {
    return (
        <div className="absolute z-10 pointer-events-none rounded px-2.5 py-2 text-[11.5px] leading-[17px] whitespace-nowrap shadow-lg"
            style={{ left: x, top: y, background: '#1B1D1F', color: '#FFFFFF' }} role="status">
            {children}
        </div>
    );
}
const TipRow = ({ color, value, label }) => (
    <div className="flex items-center gap-1.5">
        {color && <span className="inline-block w-2.5 h-0.5" style={{ background: color }} />}
        <b className="num font-medium" style={{ color: '#FFFFFF' }}>{value}</b>
        <span style={{ color: '#FFFFFF' }}>{label}</span>
    </div>
);
const Key = ({ color, label, line }) => (
    <span className="inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--mute)' }}>
        <span className="inline-block" style={{ width: line ? 12 : 8, height: line ? 2 : 8, background: color }} />{label}
    </span>
);

// A chart card with a Table toggle: every value is readable without hover or colour.
function ChartCard({ title, meta, legend, table, children, className = '' }) {
    const [asTable, setAsTable] = useState(false);
    return (
        <section className={`sheet relative ${className}`}>
            <div className="phead flex-wrap py-1.5">
                <h2>{title}</h2>
                {meta && <span className="meta">{meta}</span>}
                <div className="flex-1" />
                {!asTable && legend}
                {table && (
                    <button type="button" className="lnk" aria-pressed={asTable} onClick={() => setAsTable(v => !v)}>
                        {asTable ? 'Chart' : 'Table'}
                    </button>
                )}
            </div>
            {asTable && table ? (
                <div className="overflow-auto max-h-[320px]">
                    <table className="ctable">
                        <thead><tr>{table.cols.map((c, i) => <th key={c} className={i ? 'r' : ''}>{c}</th>)}</tr></thead>
                        <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className={j ? 'r num text-xs' : 'num text-xs'}>{v}</td>)}</tr>)}</tbody>
                    </table>
                </div>
            ) : children}
        </section>
    );
}

// Hover wrapper for small charts: maps the pointer to a data index, draws a dot on the line and a tooltip.
// y(v) is the chart's own y scale in px; padL/padR match the chart's x inset.
function HoverArea({ values, y, color, padL = 0, padR = 0, tip, children }) {
    const [s, setS] = useState(null);
    const n = values.length;
    const onMove = (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const i = Math.round(((e.clientX - r.left - padL) / Math.max(1, r.width - padL - padR)) * (n - 1));
        setS({ i: Math.max(0, Math.min(n - 1, i)), w: r.width });
    };
    const v = s ? values[s.i] : null;
    const x = s ? padL + s.i * (s.w - padL - padR) / Math.max(1, n - 1) : 0;
    return (
        <div className="relative" onMouseMove={onMove} onMouseLeave={() => setS(null)}>
            {children}
            {s && v != null && (
                <>
                    <span className="absolute pointer-events-none rounded-full" style={{ left: x - 3.5, top: y(v) - 3.5, width: 7, height: 7, background: color, border: '1.5px solid var(--panel)' }} />
                    <Tooltip x={Math.max(0, x - 45)} y={-50}>{tip(s.i)}</Tooltip>
                </>
            )}
        </div>
    );
}

function Sparkline({ cur, prev, compare, dates = [], prevDates = [], unit = '', w = 96, h = 22 }) {
    const all = [...cur, ...(compare ? prev : [])].filter(v => v != null);
    if (all.length === 0) return <svg width={w} height={h} aria-hidden="true" />;
    const lo = Math.min(...all), hi = Math.max(...all);
    const x = (i) => 2 + i * (w - 6) / Math.max(1, cur.length - 1);
    const y = (v) => 3 + (h - 6) - ((v - lo) / ((hi - lo) || 1)) * (h - 6);
    const li = cur.map((v, i) => (v != null ? i : -1)).filter(i => i >= 0).pop();
    const u = unit === '%' ? '%' : '';
    return (
        <HoverArea values={cur} y={y} color="var(--accent-text)" padL={2} padR={4} tip={(i) => (
            <>
                <TipRow color="var(--accent-text)" value={`${fmt(cur[i])}${u}`} label={dates[i] ? dayLabel(dates[i]) : ''} />
                {compare && prev[i] != null && <TipRow color="var(--viz-prev)" value={`${fmt(prev[i])}${u}`} label={prevDates[i] ? dayLabel(prevDates[i]) : 'previous'} />}
            </>
        )}>
        <svg width={w} height={h} aria-hidden="true" className="block">
            {compare && <path d={linePath(prev, x, y)} fill="none" stroke="var(--viz-prev)" strokeWidth="1.5" />}
            <path d={linePath(cur, x, y)} fill="none" stroke="var(--accent-text)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {li != null && <circle cx={x(li)} cy={y(cur[li])} r="3" fill="var(--accent-text)" stroke="var(--panel)" strokeWidth="1.5" />}
        </svg>
        </HoverArea>
    );
}

function Tile({ label, cur, prev, prevOk, dates, prevDates, unit, goodUp, compare, range, color }) {
    const now = lastVal(cur), before = lastVal(prev);
    // Only compare with the previous period when it has data (at least half of its days were scanned);
    // otherwise "vs previous N days" would be a comparison with a mostly empty period.
    const d = prevOk && now != null && before != null ? now - before : null;
    const good = d == null || d === 0 ? null : goodUp ? d > 0 : d < 0;
    const isPct = unit === '%';
    return (
        <div className="px-4 py-3" style={{ borderLeft: '1px solid var(--line-soft)' }}>
            <div className="text-[11px] font-medium" style={{ color: 'var(--mute)' }}>{label}</div>
            <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-[26px] leading-[34px] font-semibold" style={{ color: color || 'var(--ink)' }}>{now == null ? '—' : fmt(now)}</span>
                {now != null && <span className="text-xs" style={{ color: 'var(--mute)' }}>{unit}</span>}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
                <Sparkline cur={cur} prev={prev} compare={compare} dates={dates} prevDates={prevDates} unit={unit} />
                {compare && d != null && (
                    <span className="num text-[11px]" style={{ color: good == null ? 'var(--mute-2)' : good ? 'var(--ok)' : 'var(--crit)' }}>
                        {d > 0 ? '+' : d < 0 ? '−' : '±'}{fmt(Math.abs(d))}{isPct ? ' pt' : ''}
                    </span>
                )}
            </div>
            {compare && d != null && <div className="text-[10.5px] mt-px" style={{ color: 'var(--mute-2)' }}>vs previous {range} days</div>}
        </div>
    );
}

function SevPanel({ sev, values, dates, days }) {
    const w = 160, h = 72;
    const vals = values.filter(v => v != null);
    const lo = vals.length ? Math.min(...vals) * 0.92 : 0, hi = vals.length ? Math.max(...vals) * 1.04 || 1 : 1;
    const x = (i) => i * w / Math.max(1, values.length - 1);
    const y = (v) => 6 + (h - 12) - ((v - lo) / ((hi - lo) || 1)) * (h - 12);
    const p = linePath(values, x, y);
    const now = lastVal(values), start = firstVal(values);
    const d = now != null && start != null ? now - start : null;
    const li = values.map((v, i) => (v != null ? i : -1)).filter(i => i >= 0).pop();
    const covered = values.findIndex(v => v != null) < 0 ? 0 : values.length - values.findIndex(v => v != null); // days since the first data in this window
    return (
        <div className="px-3.5 pt-3 pb-2.5" style={{ borderLeft: '1px solid var(--line-soft)' }}>
            <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
                <span className="w-2 h-2" style={{ background: sev.color }} />{sev.label}
            </div>
            <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-[22px] font-semibold">{fmt(now)}</span>
                {d != null && vals.length > 1 && <span className="num text-[11px]" style={{ color: d > 0 ? 'var(--crit)' : d < 0 ? 'var(--ok)' : 'var(--mute-2)' }}>{d > 0 ? '+' : d < 0 ? '−' : '±'}{fmt(Math.abs(d))} in {covered}d</span>}
            </div>
            <div className="mt-1.5">
            <HoverArea values={values} y={y} color={sev.color} tip={(i) => <TipRow color={sev.color} value={fmt(values[i])} label={`${sev.label} · ${dates[i] ? dayLabel(dates[i]) : ''}`} />}>
            <svg viewBox={`0 0 ${w} ${h + 12}`} className="w-full block overflow-visible" preserveAspectRatio="none" style={{ height: h + 12 }} aria-label={`${sev.label} over time`}>
                <line x1="0" y1={h - 6} x2={w} y2={h - 6} stroke="var(--viz-axis)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                {p && vals.length > 1 && <path d={`${p} L${x(li).toFixed(1)},${h - 6} L${x(values.findIndex(v => v != null)).toFixed(1)},${h - 6} Z`} fill={sev.color} fillOpacity="0.12" />}
                {p && <path d={p} fill="none" stroke={sev.color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
                {vals.length === 1 && <circle cx={x(li)} cy={y(now)} r="4" fill={sev.color} stroke="var(--panel)" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
            </svg>
            </HoverArea>
            </div>
            <div className="num flex justify-between text-[10px]" style={{ color: 'var(--mute-2)' }}>
                <span>{vals.length > 1 ? `${fmt(Math.min(...vals))}–${fmt(Math.max(...vals))}` : vals.length ? '1 day of data' : 'no data'}</span><span>today</span>
            </div>
        </div>
    );
}

function NewResolved({ days }) {
    const [ref, w] = useWidth(380);
    const [hover, setHover] = useState(null);
    const h = 190, padL = 38, padR = 8, mid = h / 2;
    const max = niceMax(Math.max(1, ...days.map(d => Math.max(d.new, d.resolved))));
    const band = (w - padL - padR) / days.length;
    const bw = Math.min(24, Math.max(2, band - 2));
    const sc = (v) => (v / max) * (mid - 10);
    return (
        <div ref={ref} className="relative px-1 pt-2" onMouseLeave={() => setHover(null)}>
            <svg width={w} height={h + 18} aria-label="New and resolved findings per day">
                <line x1={padL} y1={10} x2={w - padR} y2={10} stroke="var(--viz-grid)" />
                <line x1={padL} y1={h - 10} x2={w - padR} y2={h - 10} stroke="var(--viz-grid)" />
                <text x={padL - 6} y={14} className="num" fontSize="10" fill="var(--mute-2)" textAnchor="end">+{fmt(max)}</text>
                <text x={padL - 6} y={mid + 3} className="num" fontSize="10" fill="var(--mute-2)" textAnchor="end">0</text>
                <text x={padL - 6} y={h - 6} className="num" fontSize="10" fill="var(--mute-2)" textAnchor="end">−{fmt(max)}</text>
                {days.map((d, i) => {
                    const x = padL + i * band + (band - bw) / 2;
                    const dim = hover != null && hover !== i;
                    return (
                        <g key={d.date} opacity={dim ? 0.45 : 1}>
                            {d.new > 0 && <rect x={x} y={mid - 1 - sc(d.new)} width={bw} height={sc(d.new)} rx={Math.min(2, bw / 2)} fill="var(--viz-new)" />}
                            {d.resolved > 0 && <rect x={x} y={mid + 1} width={bw} height={sc(d.resolved)} rx={Math.min(2, bw / 2)} fill="var(--viz-resolved)" />}
                            <rect x={padL + i * band} y={4} width={band} height={h - 8} fill="transparent" tabIndex={0} aria-label={`${dayLabel(d.date)}: ${d.new} new, ${d.resolved} resolved`}
                                onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
                        </g>
                    );
                })}
                <line x1={padL} y1={mid} x2={w - padR} y2={mid} stroke="var(--mute-2)" strokeWidth="1" pointerEvents="none" />
                {days.every(d => !d.new && !d.resolved) && (
                    <text x={(padL + w - padR) / 2} y={mid - 12} fontSize="12" fill="var(--mute)" textAnchor="middle">No changes recorded yet: they appear from the second scan onwards</text>
                )}
                <text x={padL} y={h + 12} className="num" fontSize="10" fill="var(--mute-2)">{dayLabel(days[0].date)}</text>
                <text x={w - padR} y={h + 12} className="num" fontSize="10" fill="var(--mute-2)" textAnchor="end">today</text>
            </svg>
            {hover != null && (
                <Tooltip x={Math.min(w - 150, padL + hover * band + band + 6)} y={16}>
                    <div style={{ color: '#FFFFFF' }}>{dayLabel(days[hover].date)}</div>
                    <TipRow color="var(--viz-new)" value={fmt(days[hover].new)} label="new" />
                    <TipRow color="var(--viz-resolved)" value={fmt(days[hover].resolved)} label="resolved" />
                </Tooltip>
            )}
        </div>
    );
}

// Multi-line chart on one axis with a crosshair tooltip
function LineChart({ series, dates, yMax, unit = '', target }) {
    const [ref, w] = useWidth(520);
    const [hover, setHover] = useState(null);
    const h = 220, padL = 40, padR = 96, padT = 12, padB = 26;
    const n = dates.length;
    const max = yMax ?? niceMax(Math.max(1, ...series.flatMap(s => s.values.filter(v => v != null))));
    const x = (i) => padL + i * (w - padL - padR) / Math.max(1, n - 1);
    const y = (v) => padT + (h - padT - padB) - (v / max) * (h - padT - padB);
    const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => t * max);
    // End labels only where they don't collide; the legend carries the rest.
    const placed = [];
    const ends = series.map(s => {
        const i = s.values.map((v, k) => (v != null ? k : -1)).filter(k => k >= 0).pop();
        if (i == null) return null;
        const ly = y(s.values[i]);
        const free = placed.every(p => Math.abs(p - ly) >= 13);
        if (free) placed.push(ly);
        return { i, ly, show: free, text: `${s.name} ${fmt(s.values[i])}${unit}` };
    });
    const onMove = (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const i = Math.round(((e.clientX - r.left) - padL) / ((w - padL - padR) / Math.max(1, n - 1)));
        setHover(Math.max(0, Math.min(n - 1, i)));
    };
    return (
        <div ref={ref} className="relative pt-2">
            <svg width={w} height={h} onMouseMove={onMove} onMouseLeave={() => setHover(null)} aria-label="Trend chart">
                {ticks.map(t => (
                    <g key={t}>
                        <line x1={padL} y1={y(t)} x2={w - padR} y2={y(t)} stroke={t === 0 ? 'var(--viz-axis)' : 'var(--viz-grid)'} />
                        <text x={padL - 6} y={y(t) + 3} className="num" fontSize="10" fill="var(--mute-2)" textAnchor="end">{fmt(t)}{unit}</text>
                    </g>
                ))}
                {target != null && (
                    <g>
                        <line x1={padL} y1={y(target)} x2={w - padR} y2={y(target)} stroke="var(--ok)" strokeWidth="1" />
                        <text x={w - padR - 2} y={y(target) - 4} fontSize="10.5" fill="var(--ok)" textAnchor="end">Target {target}{unit}</text>
                    </g>
                )}
                {hover != null && <line x1={x(hover)} y1={padT} x2={x(hover)} y2={h - padB} stroke="var(--mute-2)" />}
                {series.map((s, k) => (
                    <g key={s.name}>
                        <path d={linePath(s.values, x, y)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                        {ends[k] && <circle cx={x(ends[k].i)} cy={ends[k].ly} r="4" fill={s.color} stroke="var(--panel)" strokeWidth="2" />}
                        {ends[k]?.show && <text x={x(ends[k].i) + 8} y={ends[k].ly + 4} fontSize="11" fill="var(--ink-2)">{ends[k].text}</text>}
                    </g>
                ))}
                <text x={padL} y={h - 8} className="num" fontSize="10" fill="var(--mute-2)">{dayLabel(dates[0])}</text>
                <text x={w - padR} y={h - 8} className="num" fontSize="10" fill="var(--mute-2)" textAnchor="end">today</text>
            </svg>
            {hover != null && (
                <Tooltip x={Math.min(w - 170, x(hover) + 12)} y={20}>
                    <div style={{ color: '#FFFFFF' }}>{dayLabel(dates[hover])}</div>
                    {series.map(s => <TipRow key={s.name} color={s.color} value={s.values[hover] == null ? '—' : `${fmt(s.values[hover])}${unit}`} label={s.name} />)}
                </Tooltip>
            )}
        </div>
    );
}

function Heatmap({ days }) {
    const [ref, w] = useWidth(900);
    const [hover, setHover] = useState(null);
    const iw = w - 28; // inner width after the card's horizontal padding
    const labelW = 150, totalW = 48, rowH = 26;
    const cellW = Math.max(4, (iw - labelW - totalW) / days.length - 2);
    const cellsEnd = labelW + days.length * (cellW + 2) - 2;
    const h = HEAT_ROWS.length * rowH + 20;
    return (
        <div ref={ref} className="relative px-3.5 pt-3 pb-1" onMouseLeave={() => setHover(null)}>
            <svg width={iw} height={h} aria-label="Scan runs per scanner per day">
                {HEAT_ROWS.map(([id, name], r) => {
                    const y = r * rowH;
                    const total = days.reduce((a, d) => a + (d.runs[id]?.runs || 0), 0);
                    return (
                        <g key={id}>
                            <text x={labelW - 10} y={y + 15} fontSize="12" fill="var(--ink-2)" textAnchor="end">{name}</text>
                            {days.map((d, i) => {
                                const c = d.runs[id] || { runs: 0, failed: 0 };
                                const x = labelW + i * (cellW + 2);
                                const on = hover && hover.r === r && hover.i === i;
                                return (
                                    <g key={d.date}>
                                        <rect x={x} y={y} width={cellW} height={rowH - 4} rx="3" fill={HEAT_FILL[Math.min(4, c.runs)]}
                                            stroke={on ? 'var(--ink)' : 'none'} strokeWidth="1.5" tabIndex={0}
                                            aria-label={`${name}, ${dayLabel(d.date)}: ${c.runs} runs, ${c.failed} failed`}
                                            onMouseEnter={() => setHover({ r, i, x, y, name, date: d.date, ...c })} onFocus={() => setHover({ r, i, x, y, name, date: d.date, ...c })} />
                                        {c.failed > 0 && cellW >= 8 && <path d={`M${x + cellW},${y} L${x + cellW},${y + 8} L${x + cellW - 8},${y} Z`} fill="var(--viz-crit)" pointerEvents="none" />}
                                    </g>
                                );
                            })}
                            <text x={iw - 2} y={y + 15} className="num" fontSize="10.5" fill="var(--mute-2)" textAnchor="end">{total}</text>
                        </g>
                    );
                })}
                <text x={labelW} y={h - 4} className="num" fontSize="10" fill="var(--mute-2)">{dayLabel(days[0].date)}</text>
                <text x={cellsEnd} y={h - 4} className="num" fontSize="10" fill="var(--mute-2)" textAnchor="end">today</text>
                <text x={iw - 2} y={h - 4} className="num" fontSize="10" fill="var(--mute-2)" textAnchor="end">runs</text>
            </svg>
            {hover && (
                <Tooltip x={Math.min(iw - 190, hover.x + cellW + 20)} y={hover.y + 34}>
                    <div style={{ color: '#FFFFFF' }}>{hover.name} · {dayLabel(hover.date)}</div>
                    <TipRow value={hover.runs} label="runs" />
                    <TipRow value={hover.failed} label="failed" />
                </Tooltip>
            )}
        </div>
    );
}

// ── Section ────────────────────────────────────────────────────────────────

export default function HistoryCharts({ children }) {
    const { cluster } = useCluster();
    const [range, setRange] = useState(7);
    const [compare, setCompare] = useState(true);
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        let alive = true;
        fetch(apiUrl(cluster, `/api/dashboard/history?days=${range}`))
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => { if (alive) { setData(d); setError(null); } })
            .catch(e => { if (alive) setError(e.message); });
        return () => { alive = false; };
    }, [range, cluster]);

    const view = useMemo(() => {
        if (!data || data.days !== range) return null;
        const cur = data.series.slice(range), prev = data.series.slice(0, range);
        const pick = (list, f) => list.map(d => f(d.stats));
        return {
            cur, prev, dates: cur.map(d => d.date), prevDates: prev.map(d => d.date),
            prevOk: prev.filter(d => d.observed).length * 2 >= range,
            observed: cur.filter(d => d.observed).length,
            score: [pick(cur, computeSecurityScore), pick(prev, computeSecurityScore)],
            crit: [pick(cur, s => sevTotal(s, 'CRITICAL')), pick(prev, s => sevTotal(s, 'CRITICAL'))],
            high: [pick(cur, s => sevTotal(s, 'HIGH')), pick(prev, s => sevTotal(s, 'HIGH'))],
            pol: [pick(cur, s => rate(s?.kyverno)), pick(prev, s => rate(s?.kyverno))],
            cis: [pick(cur, s => rate(s?.kubebench)), pick(prev, s => rate(s?.kubebench))],
            sev: SEVERITIES.map(sv => pick(cur, s => sevTotal(s, sv.key))),
            byScanner: VULN_SOURCES.map(src => ({ name: src.name, color: src.color, values: pick(cur, s => critOf(s, src.key)) })),
        };
    }, [data, range]);

    const ranges = [7, 30, 90];

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3.5 flex-wrap">
                <div className="seg" role="group" aria-label="Time range">
                    {ranges.map(r => (
                        <button key={r} type="button" className={range === r ? 'on' : ''} aria-pressed={range === r} onClick={() => setRange(r)}>{r} days</button>
                    ))}
                </div>
                {view && <span className="num text-xs" style={{ color: 'var(--mute)' }}>{dayLabel(view.dates[0])} – {dayLabel(view.dates[view.dates.length - 1])}</span>}
                <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--ink-2)' }}>
                    <input type="checkbox" checked={compare} onChange={e => setCompare(e.target.checked)} /> Compare with previous period
                </label>
            </div>

            {error && <div className="note note-warn">History unavailable ({error}).</div>}
            {!view && !error && <div className="sheet px-4 py-8 text-center text-xs" style={{ color: 'var(--mute)' }}>Loading history…</div>}

            {view && (
                <div className="flex flex-col gap-[18px]" style={{ opacity: data.days === range ? 1 : 0.5 }}>
                    {view.observed < 2 && (
                        <div className="note note-warn">
                            <span>
                                Collecting history: {data.snapshots} snapshot{data.snapshots === 1 ? '' : 's'} so far
                                {data.first_snapshot ? `, since ${new Date(data.first_snapshot).toLocaleDateString([], { day: 'numeric', month: 'short' })}` : ''}.
                                A snapshot is saved after every scan, so trends fill in as scans run on more days. Scan activity below already uses past run reports.
                            </span>
                        </div>
                    )}

                    <div className="sheet grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 [&>*:first-child]:border-l-0">
                        <Tile prevOk={view.prevOk} dates={view.dates} prevDates={view.prevDates} label="Security score" cur={view.score[0]} prev={view.score[1]} unit="/ 100" goodUp compare={compare} range={range} />
                        <Tile prevOk={view.prevOk} dates={view.dates} prevDates={view.prevDates} label="Critical findings" cur={view.crit[0]} prev={view.crit[1]} unit="open" compare={compare} range={range} color={lastVal(view.crit[0]) ? 'var(--crit)' : undefined} />
                        <Tile prevOk={view.prevOk} dates={view.dates} prevDates={view.prevDates} label="High findings" cur={view.high[0]} prev={view.high[1]} unit="open" compare={compare} range={range} />
                        <Tile prevOk={view.prevOk} dates={view.dates} prevDates={view.prevDates} label="Policy pass rate" cur={view.pol[0]} prev={view.pol[1]} unit="%" goodUp compare={compare} range={range} />
                        <Tile prevOk={view.prevOk} dates={view.dates} prevDates={view.prevDates} label="CIS pass rate" cur={view.cis[0]} prev={view.cis[1]} unit="%" goodUp compare={compare} range={range} />
                    </div>

                    <div className="grid grid-cols-1 2xl:grid-cols-[1.9fr_1fr] gap-[18px]">
                        <ChartCard title="Open findings by severity" meta="Each panel has its own scale · image, SBOM, repo and cluster"
                            table={{ cols: ['Day', ...SEVERITIES.map(s => s.label)], rows: view.dates.map((d, i) => [dayLabel(d), ...view.sev.map(v => fmt(v[i]))]).reverse() }}>
                            <div className="grid grid-cols-2 lg:grid-cols-4 [&>*:first-child]:border-l-0">
                                {SEVERITIES.map((s, k) => <SevPanel key={s.key} sev={s} dates={view.dates} values={view.sev[k]} days={range} />)}
                            </div>
                        </ChartCard>
                        <ChartCard title="New vs resolved" meta="Findings per day, compared with the previous scan"
                            legend={<><Key color="var(--viz-new)" label="New" /><Key color="var(--viz-resolved)" label="Resolved" /></>}
                            table={{ cols: ['Day', 'New', 'Resolved'], rows: view.cur.map(d => [dayLabel(d.date), fmt(d.new), fmt(d.resolved)]).reverse() }}>
                            <NewResolved days={view.cur} />
                            <div className="flex gap-4 px-3.5 py-2.5 text-xs" style={{ borderTop: '1px solid var(--line-soft)', color: 'var(--mute)' }}>
                                <span><b className="num" style={{ color: 'var(--ink)' }}>{fmt(view.cur.reduce((a, d) => a + d.new, 0))}</b> new</span>
                                <span><b className="num" style={{ color: 'var(--ink)' }}>{fmt(view.cur.reduce((a, d) => a + d.resolved, 0))}</b> resolved</span>
                                <span>in {range} days</span>
                            </div>
                        </ChartCard>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-[18px]">
                        <ChartCard title="Critical findings by scanner" meta="Open at the end of each day"
                            legend={<>{view.byScanner.map(s => <Key key={s.name} color={s.color} label={s.name} line />)}</>}
                            table={{ cols: ['Day', ...view.byScanner.map(s => s.name)], rows: view.dates.map((d, i) => [dayLabel(d), ...view.byScanner.map(s => fmt(s.values[i]))]).reverse() }}>
                            <LineChart series={view.byScanner} dates={view.dates} />
                        </ChartCard>
                        <ChartCard title="Compliance pass rate" meta="Share of checks passing"
                            legend={<><Key color="var(--accent-text)" label="Policies" line /><Key color="var(--mute-2)" label="CIS benchmark" line /></>}
                            table={{ cols: ['Day', 'Policies %', 'CIS %'], rows: view.dates.map((d, i) => [dayLabel(d), fmt(view.pol[0][i]), fmt(view.cis[0][i])]).reverse() }}>
                            <LineChart series={[{ name: 'Policies', color: 'var(--accent-text)', values: view.pol[0] }, { name: 'CIS', color: 'var(--mute-2)', values: view.cis[0] }]}
                                dates={view.dates} yMax={100} unit="%" target={90} />
                        </ChartCard>
                    </div>
                </div>
            )}

            {children}

            {view && (
                <div style={{ opacity: data.days === range ? 1 : 0.5 }}>
                    <ChartCard title="Scan activity" meta="Runs per scanner per day · darker = more runs"
                        legend={<>
                            <span className="text-[11px]" style={{ color: 'var(--mute)' }}>0</span>
                            {HEAT_FILL.slice(1).map(f => <span key={f} className="inline-block w-3.5 h-2.5" style={{ background: f }} />)}
                            <span className="text-[11px]" style={{ color: 'var(--mute)' }}>4+</span>
                            <span className="inline-flex items-center gap-1.5 text-[11.5px] ml-2" style={{ color: 'var(--mute)' }}>
                                <svg width="10" height="10" aria-hidden="true"><path d="M10,0 L10,10 L0,0 Z" fill="var(--viz-crit)" /></svg>Had a failed run
                            </span>
                        </>}
                        table={{ cols: ['Day', ...HEAT_ROWS.map(r => r[1])], rows: view.cur.map(d => [dayLabel(d.date), ...HEAT_ROWS.map(([id]) => { const c = d.runs[id]; return c ? `${c.runs}${c.failed ? ` (${c.failed} failed)` : ''}` : '0'; })]).reverse() }}>
                        <Heatmap days={view.cur} />
                    </ChartCard>
                </div>
            )}
        </div>
    );
}
