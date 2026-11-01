import React, { useEffect, useState } from 'react';

// Open findings by how long they have been open, plus what appeared / was fixed in the last 7 days.
export default function FindingsAge() {
    const [data, setData] = useState(null);
    useEffect(() => {
        fetch('/api/dashboard/findings-age').then(r => (r.ok ? r.json() : null)).then(setData).catch(() => { });
    }, []);
    if (!data) return null;

    const max = Math.max(1, ...data.buckets.map(b => b.count));
    const stats = [['Open', data.open], ['New, last 7 days', data.new_7d], ['Resolved, last 7 days', data.resolved_7d]];
    return (
        <section className="sheet">
            <div className="phead"><h2>Findings age</h2><span className="meta">Open findings by time since first seen</span></div>
            <div className="grid grid-cols-3 gap-px" style={{ background: 'var(--line)' }}>
                {stats.map(([label, n]) => (
                    <div key={label} className="px-3.5 py-2.5" style={{ background: 'var(--panel)' }}>
                        <div className="num text-[20px] font-semibold">{n}</div>
                        <div className="text-[12px]" style={{ color: 'var(--mute)' }}>{label}</div>
                    </div>
                ))}
            </div>
            <ul className="m-0 px-3.5 py-3 list-none flex flex-col gap-1.5">
                {data.buckets.map(b => (
                    <li key={b.label} className="flex items-center gap-3 text-[12px]">
                        <span className="w-[56px]" style={{ color: 'var(--mute)' }}>{b.label}</span>
                        <span className="flex-1 h-[8px] rounded-sm" style={{ background: 'var(--line)' }}>
                            <span className="block h-full rounded-sm" style={{ width: `${(b.count / max) * 100}%`, background: 'var(--viz-s1)' }} />
                        </span>
                        <span className="num w-[48px] text-right">{b.count}</span>
                    </li>
                ))}
            </ul>
        </section>
    );
}
