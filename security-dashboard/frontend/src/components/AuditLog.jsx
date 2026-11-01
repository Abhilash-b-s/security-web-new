import React, { useEffect, useState } from 'react';
import PageHead from './PageHead';

// Superuser-only view of who did what (login, scans, suppressions, settings changes).
export default function AuditLog() {
    const [rows, setRows] = useState([]);
    const [action, setAction] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        const t = setTimeout(() => {
            fetch(`/api/audit?limit=500&action=${encodeURIComponent(action)}`)
                .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
                .then(d => { setRows(d); setError(''); })
                .catch(e => setError(e.message));
        }, 250);
        return () => clearTimeout(t);
    }, [action]);

    return (
        <div className="flex-1 min-h-0 overflow-auto px-7 pt-[18px] pb-6 flex flex-col gap-3.5">
            <PageHead eyebrow="Administration" title="Audit log" sub="Most recent 500 events">
                <input type="text" className="inp h-[28px]" placeholder="Filter by action, e.g. login. or scan.start"
                    aria-label="Filter by action" value={action} onChange={e => setAction(e.target.value)} />
            </PageHead>
            {error && <div className="text-xs" style={{ color: 'var(--viz-crit)' }}>Could not load the audit log: {error}</div>}
            <section className="sheet overflow-auto">
                <table className="ctable">
                    <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Target</th><th>Detail</th><th>IP</th></tr></thead>
                    <tbody>
                        {rows.map(r => (
                            <tr key={r.id}>
                                <td className="num whitespace-nowrap">{new Date(r.ts).toLocaleString()}</td>
                                <td>{r.actor}</td>
                                <td>{r.action}</td>
                                <td>{r.target}</td>
                                <td>{r.detail}</td>
                                <td className="num">{r.ip}</td>
                            </tr>
                        ))}
                        {!rows.length && !error && <tr><td colSpan={6} style={{ color: 'var(--mute)' }}>No events.</td></tr>}
                    </tbody>
                </table>
            </section>
        </div>
    );
}
