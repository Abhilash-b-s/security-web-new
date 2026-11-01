import React, { useState, useEffect } from 'react';

const detail = async (res) => (await res.json().catch(() => ({}))).detail || res.statusText;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_TIMES = 6;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const parse = (s) => s.split(',').map((t) => t.trim()).filter(Boolean);
const fmtUtc = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};
const validate = (text) => {
    const t = parse(text);
    if (t.length > MAX_TIMES) return `At most ${MAX_TIMES} times.`;
    const bad = t.find((x) => !HHMM.test(x));
    if (bad) return `"${bad}" is not a valid HH:MM time (00:00-23:59).`;
    if (new Set(t).size !== t.length) return 'Duplicate times.';
    return null;
};
const STATUS_BADGE = { completed: 'badge-ok', failed: 'badge-crit', cancelled: 'badge-mute', skipped: 'badge-mute' };
const utcNow = () => new Date().toISOString().slice(11, 16);

// Settings -> Schedule: daily scan times (UTC) per cluster.
export default function SchedulesSettings() {
    const [list, setList] = useState(null); // null = loading
    const [loadError, setLoadError] = useState(null);
    const [edits, setEdits] = useState({}); // cluster -> { text, enabled }
    const [saved, setSaved] = useState({}); // cluster -> true briefly
    const [errors, setErrors] = useState({}); // cluster -> server error
    const [busy, setBusy] = useState({});
    const [now, setNow] = useState(utcNow());

    const load = async () => {
        try {
            const res = await fetch('/api/schedules');
            if (!res.ok) throw new Error(await detail(res));
            setList(await res.json());
            setLoadError(null);
        } catch (err) {
            setLoadError(err.message);
            setList((l) => l || []);
        }
    };
    useEffect(() => {
        load();
        const a = setInterval(load, 60000);
        const b = setInterval(() => setNow(utcNow()), 30000);
        return () => { clearInterval(a); clearInterval(b); };
    }, []);

    const cur = (s) => edits[s.cluster] || { text: s.times.join(', '), enabled: s.enabled };
    const patch = (s, p) => {
        setEdits((e) => ({ ...e, [s.cluster]: { ...cur(s), ...p } }));
        setSaved((x) => ({ ...x, [s.cluster]: false }));
        setErrors((x) => ({ ...x, [s.cluster]: null }));
    };
    const dirty = (s) => {
        const c = cur(s);
        return c.enabled !== s.enabled || JSON.stringify(parse(c.text).sort()) !== JSON.stringify([...s.times].sort());
    };

    const save = async (s) => {
        const c = cur(s);
        setBusy((b) => ({ ...b, [s.cluster]: true }));
        try {
            const res = await fetch(`/api/schedules/${encodeURIComponent(s.cluster)}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ times: parse(c.text), enabled: c.enabled }),
            });
            if (!res.ok) throw new Error(await detail(res));
            setEdits((e) => { const n = { ...e }; delete n[s.cluster]; return n; });
            setSaved((x) => ({ ...x, [s.cluster]: true }));
            setTimeout(() => setSaved((x) => ({ ...x, [s.cluster]: false })), 3000);
            await load();
        } catch (err) {
            setErrors((x) => ({ ...x, [s.cluster]: err.message }));
        } finally {
            setBusy((b) => ({ ...b, [s.cluster]: false }));
        }
    };

    // Other cluster using the same time (from the edited values).
    const clash = (s) => {
        const mine = parse(cur(s).text);
        if (!cur(s).enabled) return null;
        const o = (list || []).find((x) => x.cluster !== s.cluster && cur(x).enabled && parse(cur(x).text).some((t) => mine.includes(t)));
        return o ? o.cluster : null;
    };

    return (
        <div className="flex flex-col gap-[18px] max-w-5xl">
            <section className="sheet">
                <div className="phead">
                    <h2>Schedule <span className="count">{list ? list.length : 0}</span></h2>
                    <span className="meta">Now {now} UTC</span>
                </div>
                <p className="m-0 px-3.5 pt-3 text-[12px]" style={{ color: 'var(--mute)' }}>
                    Daily scans per cluster. Times are UTC (now {now} UTC). Each run starts the Full scan list from Settings; Trivy scans never overlap: a run that has to wait starts as soon as the running scan finishes.
                </p>
                {loadError && <div className="note note-crit m-3.5">{loadError}</div>}
                {list && !list.length && !loadError && <div className="note m-3.5">No clusters.</div>}
                {list === null && <div className="note m-3.5">Loading...</div>}
                {list && list.length > 0 && (
                    <div className="overflow-x-auto">
                        <table className="ctable">
                            <thead><tr><th>Cluster</th><th>Enabled</th><th>Times (UTC, HH:MM)</th><th>Next run (UTC)</th><th>Last run</th><th className="r">Save</th></tr></thead>
                            <tbody>
                                {list.map((s) => {
                                    const c = cur(s);
                                    const err = validate(c.text);
                                    const other = clash(s);
                                    const id = `sched-${s.cluster}`;
                                    return (
                                        <tr key={s.cluster}>
                                            <td className="num text-xs">{s.cluster}</td>
                                            <td>
                                                <input type="checkbox" aria-label={`Enable daily scans for ${s.cluster}`} checked={c.enabled} onChange={(e) => patch(s, { enabled: e.target.checked })} />
                                            </td>
                                            <td style={{ minWidth: 220 }}>
                                                <label htmlFor={id} className="sr-only">Scan times for {s.cluster}</label>
                                                <input id={id} type="text" className="inp mono" placeholder="02:00, 14:00" value={c.text} aria-invalid={!!err} onChange={(e) => patch(s, { text: e.target.value })} />
                                                {err && <div className="text-[11.5px] mt-1" style={{ color: 'var(--crit)' }}>{err}</div>}
                                                {errors[s.cluster] && <div className="text-[11.5px] mt-1" style={{ color: 'var(--crit)' }}>{errors[s.cluster]}</div>}
                                                {!err && other && <div className="text-[11.5px] mt-1" style={{ color: 'var(--mute)' }}>Same time as {other}: the second run waits for the first.</div>}
                                            </td>
                                            <td className="num text-xs">{s.enabled && s.next_run_at ? fmtUtc(s.next_run_at) : <span style={{ color: 'var(--faint)' }}>—</span>}</td>
                                            <td className="text-xs">
                                                {s.last_run_at ? <span className="num">{fmtUtc(s.last_run_at)}</span> : <span style={{ color: 'var(--faint)' }}>Never</span>}
                                                {s.last_status && <span className={`badge ${STATUS_BADGE[s.last_status] || 'badge-mute'} ml-1.5`}>{s.last_status}</span>}
                                                {s.waiting && <div className="mt-1"><span className="badge badge-warn">Waiting for a running Trivy scan</span></div>}
                                            </td>
                                            <td className="r whitespace-nowrap">
                                                <span aria-live="polite" className="text-[11.5px] mr-2" style={{ color: 'var(--ok)' }}>{saved[s.cluster] ? 'Saved' : ''}</span>
                                                <button type="button" className="btn btn-primary" disabled={!dirty(s) || !!err || busy[s.cluster]} onClick={() => save(s)}>{busy[s.cluster] ? 'Saving...' : 'Save'}</button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}
