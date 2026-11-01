import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';

// Badge class per severity / status value.
const BADGE = {
  CRITICAL: 'badge-crit', HIGH: 'badge-high', MEDIUM: 'badge-warn', LOW: 'badge-low', UNKNOWN: 'badge-mute',
  FAIL: 'badge-crit', ERROR: 'badge-crit', WARN: 'badge-warn', PASS: 'badge-ok', SKIP: 'badge-mute', INFO: 'badge-mute',
};
export const Badge = ({ value }) => <span className={`badge ${BADGE[value] || 'badge-mute'}`}>{value}</span>;

// Report types shown under "Scan reports" in the left panel.
export const REPORT_TABS = [
  { id: 'image', label: 'Image Vulnerability', key: 'trivyImage' },
  { id: 'sbom', label: 'SBOM Reports', key: 'trivySbom' },
  { id: 'kyverno', label: 'Policy Scan Report', key: 'kyverno' },
  { id: 'nmap', label: 'Network Nmap Scan', key: 'nmap' },
  { id: 'cis', label: 'CIS Benchmark', key: 'kubebench' },
  { id: 'trivy-repo', label: 'Git Repository', key: 'trivyRepo' },
  { id: 'cluster', label: 'Cluster Scan', key: 'cluster' },
  { id: 'compliance', label: 'Compliance', key: 'compliance' },
];

export const SEV_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];
export const SEV_COLOR = { CRITICAL: 'var(--crit)', HIGH: 'var(--high)', MEDIUM: 'var(--medium)', LOW: 'var(--low)', UNKNOWN: 'var(--faint)', FAIL: 'var(--crit)', ERROR: 'var(--crit)', WARN: 'var(--warn)', PASS: 'var(--ok)', SKIP: 'var(--faint)', INFO: 'var(--faint)' };

export const countBy = (rows, key) => rows.reduce((a, r) => { a[r[key]] = (a[r[key]] || 0) + 1; return a; }, {});

// Strip of headline figures: [{ label, value, note, color }]
export function FigureStrip({ items }) {
  return (
    <div className="sheet grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((it, i) => (
        <div key={it.label} className="px-4 py-2.5" style={{ borderLeft: i ? '1px solid var(--line-soft)' : 0 }}>
          <div className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: 'var(--mute)' }}>
            {it.swatch && <span className="w-2 h-2 inline-block" style={{ background: it.swatch }} />}
            {it.label}
          </div>
          <div className="num text-[22px] leading-8 font-medium" style={{ color: it.color || 'var(--ink)' }}>{it.value}</div>
          {it.note && <div className="num text-[11px]" style={{ color: 'var(--mute-2)' }}>{it.note}</div>}
        </div>
      ))}
    </div>
  );
}

// Joined toggle buttons with counts. value: { KEY: bool }
export function ToggleGroup({ keys, value, onChange, counts = {}, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {keys.map(k => (
        <button key={k} type="button" aria-pressed={!!value[k]} className={value[k] ? 'on' : ''} onClick={() => onChange({ ...value, [k]: !value[k] })}>
          <span className="inline-block w-2 h-2 mr-1.5 align-[1px]" style={{ background: SEV_COLOR[k] || 'var(--faint)', opacity: value[k] ? 1 : 0.35 }} />
          {k[0] + k.slice(1).toLowerCase()} <span className="num ml-0.5" style={{ color: 'var(--mute-2)' }}>{counts[k] || 0}</span>
        </button>
      ))}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder, width = 260 }) {
  return (
    <label className="relative block" style={{ width }}>
      <span className="sr-only">{placeholder}</span>
      <Search className="absolute left-2.5 top-[7px] w-3.5 h-3.5" style={{ color: 'var(--faint)' }} />
      <input type="text" className="inp h-7 pl-8 pr-7" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
      {value && (
        <button type="button" aria-label="Clear search" className="absolute right-2 top-[7px] bg-transparent border-0 p-0 cursor-pointer" style={{ color: 'var(--faint)' }} onClick={() => onChange('')}>
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </label>
  );
}

export const FilterLabel = ({ children }) => <span className="text-[10.5px] font-semibold tracking-[.06em] uppercase" style={{ color: 'var(--mute-2)' }}>{children}</span>;

// Dropdown multi-select with search, Select all / Clear and per-option counts.
// selected: array of values; empty array means "all".
export function MultiSelect({ label, options, selected, onChange, counts = {}, allLabel, width = 200 }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const shown = options.filter(o => o.toLowerCase().includes(q.toLowerCase()));
  const summary = selected.length === 0 ? (allLabel || `All (${options.length})`) : selected.join(', ');
  const toggle = (o) => onChange(selected.includes(o) ? selected.filter(x => x !== o) : [...selected, o]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="inp h-7 flex items-center gap-1.5 text-left cursor-pointer" style={{ width }} aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={() => setOpen(v => !v)}>
        <span className="flex-1 truncate">{summary}</span>
        {selected.length > 0 && <span className="num text-[10.5px] px-1 rounded-sm" style={{ background: 'var(--accent-tint)', color: 'var(--accent-text)' }}>{selected.length}</span>}
        <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--mute-2)' }} />
      </button>
      {open && (
        <div role="listbox" aria-label={label} aria-multiselectable="true" className="absolute z-30 mt-1 w-[260px] rounded-md shadow-lg" style={{ background: 'var(--panel)', border: '1px solid var(--line-strong)' }}>
          <div className="p-2" style={{ borderBottom: '1px solid var(--line-soft)' }}>
            <input type="search" className="inp h-7" placeholder={`Find ${label.toLowerCase()}`} aria-label={`Find ${label.toLowerCase()}`} value={q} onChange={e => setQ(e.target.value)} autoFocus />
          </div>
          <div className="flex gap-3 px-3 py-1.5 text-xs" style={{ borderBottom: '1px solid var(--line-soft)' }}>
            <button type="button" className="lnk" onClick={() => onChange([...options])}>Select all</button>
            <button type="button" className="lnk" onClick={() => onChange([])}>Clear</button>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {shown.map(o => (
              <label key={o} className="flex items-center gap-2 px-3 py-[5px] text-[13px] cursor-pointer hover:bg-[var(--row-hover)]">
                <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)} />
                <span className="num text-xs flex-1 truncate">{o || '(none)'}</span>
                {counts[o] != null && <span className="num text-[11px]" style={{ color: counts[o] ? 'var(--crit)' : 'var(--faint)' }}>{counts[o]}</span>}
              </label>
            ))}
            {shown.length === 0 && <div className="px-3 py-2 text-xs" style={{ color: 'var(--mute)' }}>No matches</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// Removable active-filter chip
export const Chip = ({ label, value, onRemove }) => (
  <span className="inline-flex items-center gap-1.5 h-6 pl-2 pr-1 text-xs rounded-sm" style={{ background: 'var(--accent-tint)', color: 'var(--ink-2)', border: '1px solid var(--accent-line)' }}>
    {label}: <b className="font-semibold max-w-[220px] truncate">{value}</b>
    <button type="button" aria-label={`Remove ${label.toLowerCase()} filter`} className="bg-transparent border-0 p-0.5 cursor-pointer" style={{ color: 'var(--mute)' }} onClick={onRemove}>
      <X className="w-3 h-3" />
    </button>
  </span>
);

// Sorting
export function useSort(initialKey, initialDir = 'asc') {
  const [sort, setSort] = useState({ key: initialKey, dir: initialDir });
  const toggle = (key) => setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  return [sort, toggle, setSort];
}
export function sortRows(rows, { key, dir }, rank = {}) {
  if (!key) return rows;
  const val = (r) => (rank[key] ? rank[key](r[key]) : r[key]);
  return [...rows].sort((a, b) => {
    const x = val(a), y = val(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
    return dir === 'asc' ? c : -c;
  });
}
export function SortTh({ label, k, sort, onSort, className = '', style }) {
  const on = sort.key === k;
  return (
    <th className={className} style={style} aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 bg-transparent border-0 p-0 cursor-pointer uppercase tracking-[.06em] font-bold text-[11px]" style={{ color: on ? 'var(--ink)' : 'inherit' }}>
        {label}<span className="text-[9px]" style={{ color: on ? 'var(--accent-text)' : 'var(--faint)' }}>{on ? (sort.dir === 'asc' ? '▲' : '▼') : '▲▼'}</span>
      </button>
    </th>
  );
}

// Pagination: resets to page 1 whenever `resetKey` changes.
export function usePaging(rows, resetKey, initialPer = 25) {
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(initialPer);
  useEffect(() => { setPage(1); }, [resetKey, per]);
  const pages = Math.max(1, Math.ceil(rows.length / per));
  const cur = Math.min(page, pages);
  const slice = useMemo(() => rows.slice((cur - 1) * per, cur * per), [rows, cur, per]);
  return { slice, page: cur, pages, per, setPer, setPage, total: rows.length, from: rows.length ? (cur - 1) * per + 1 : 0, to: Math.min(cur * per, rows.length) };
}
export function Pager({ p, note }) {
  const nums = [];
  for (let i = 1; i <= p.pages; i++) {
    if (i === 1 || i === p.pages || Math.abs(i - p.page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  return (
    <div className="flex items-center gap-2 px-3.5 py-2 text-xs flex-wrap" style={{ borderTop: '1px solid var(--line)', background: 'var(--panel-head)', color: 'var(--mute)' }}>
      <span>Rows <span className="num">{p.from}–{p.to}</span> of <span className="num">{p.total}</span>{note ? ` · ${note}` : ''}</span>
      <div className="flex-1" />
      <label className="flex items-center gap-1.5">Per page
        <select className="inp h-[26px] w-[64px] py-0" value={p.per} onChange={e => p.setPer(Number(e.target.value))}>
          {[25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <button type="button" className="btn h-[26px] px-2" disabled={p.page <= 1} onClick={() => p.setPage(p.page - 1)} aria-label="Previous page">‹</button>
      {nums.map((n, i) => n === '…'
        ? <span key={`e${i}`}>…</span>
        : <button key={n} type="button" className={`btn h-[26px] px-2 num ${n === p.page ? 'btn-primary' : ''}`} aria-current={n === p.page ? 'page' : undefined} onClick={() => p.setPage(n)}>{n}</button>)}
      <button type="button" className="btn h-[26px] px-2" disabled={p.page >= p.pages} onClick={() => p.setPage(p.page + 1)} aria-label="Next page">›</button>
    </div>
  );
}

export function EmptyRow({ cols, children }) {
  return <tr><td colSpan={cols} className="!py-10 text-center text-[13px]" style={{ color: 'var(--mute)' }}>{children}</td></tr>;
}

export function downloadCsv(filename, header, rows) {
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const text = [header, ...rows].map(r => r.map(esc).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
