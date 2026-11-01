import React, { useEffect, useMemo, useState } from 'react';
import { Download, ChevronRight } from 'lucide-react';
import PageHead from './PageHead';
import { useCluster, apiUrl } from '../cluster';
import { Badge, SEV_ORDER, FigureStrip, SearchBox, useSort, sortRows, SortTh, usePaging, Pager, EmptyRow, downloadCsv } from './reportParts';

const STATUS_FILTERS = ['ALL', 'FAIL', 'PASS'];

// Control ids like "1.10" sort numerically, not as text.
const idKey = (id) => id.split('.').map(n => String(n).padStart(4, '0')).join('.');

/** Compliance (Trivy NSA / Pod Security) report view: spec selector, pass rate, expandable controls table. */
export default function ComplianceReport() {
  const { cluster } = useCluster(); // App remounts this page when the cluster changes
  const [specs, setSpecs] = useState(null); // null = loading
  const [error, setError] = useState(null);
  const [specId, setSpecId] = useState('');
  const [status, setStatus] = useState('ALL');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(() => new Set());
  const [sort, onSort] = useSort('severity', 'asc');

  useEffect(() => {
    fetch(apiUrl(cluster, '/api/compliance'))
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(d => { setSpecs(d.specs); setSpecId(s => s || d.specs[0]?.id || ''); })
      .catch(e => { setError(e.message); setSpecs([]); });
  }, []);

  const spec = specs?.find(s => s.id === specId);
  const rows = useMemo(() => spec?.controls || [], [spec]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = rows
      .filter(c => status === 'ALL' || c.status === status)
      .filter(c => !needle || [c.id, c.name, c.description].some(v => String(v || '').toLowerCase().includes(needle)));
    return sortRows(base, sort, { severity: s => SEV_ORDER.indexOf(s), id: idKey });
  }, [rows, status, q, sort]);
  const paging = usePaging(filtered, `${specId}|${status}|${q}`);

  const toggle = (id) => setOpen(o => { const n = new Set(o); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const t = spec?.totals;
  const counts = { ALL: rows.length, FAIL: t?.fail || 0, PASS: t?.pass || 0 };
  const exportCsv = () => downloadCsv(`${specId}.csv`, ['Control', 'Name', 'Severity', 'Status', 'Failing resources', 'Remediation'],
    filtered.map(c => [c.id, c.name, c.severity, c.status, c.failing_count, c.remediation]));

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="shrink-0 px-7 pt-[18px]">
        <PageHead title="Compliance" sub="Trivy NSA and Pod Security Standards checks against the cluster workloads">
          {spec && <button type="button" className="btn btn-accent" onClick={exportCsv} disabled={!filtered.length}><Download className="w-3.5 h-3.5" /> Download .csv</button>}
        </PageHead>
      </div>
      <div className="flex-1 overflow-auto px-7 pt-3.5 pb-6">
        {error && <div className="note note-crit"><div><div className="font-semibold">Error loading report</div><div>{error}</div></div></div>}
        {specs === null && <div className="sheet px-4 py-10 text-center text-xs" style={{ color: 'var(--mute)' }}>Loading report…</div>}
        {specs && !specs.length && !error && (
          <div className="sheet px-4 py-10 text-center text-xs" style={{ color: 'var(--mute)' }}>No compliance report yet. Run the Compliance scan.</div>
        )}
        {spec && (
          <div className="flex flex-col gap-3.5">
            <FigureStrip items={[
              { label: 'Pass rate', value: `${t.pass_rate}%`, color: t.pass_rate === 100 ? 'var(--ok)' : undefined, note: spec.title },
              { label: 'Passing', swatch: 'var(--ok)', value: t.pass },
              { label: 'Failing', swatch: 'var(--crit)', value: t.fail, color: t.fail ? 'var(--crit)' : undefined },
              { label: 'Controls', value: t.total, note: `generated ${new Date(spec.generated_at * 1000).toLocaleString()}` },
            ]} />
            <section className="sheet min-w-0">
              <div className="phead flex-wrap">
                <h2>Controls <span className="count">{filtered.length}</span></h2>
                <span className="meta">{spec.description}</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 px-3.5 py-2" style={{ background: 'var(--panel-head)', borderBottom: '1px solid var(--line)' }}>
                <select className="inp h-7 w-[260px] py-0" aria-label="Compliance spec" value={specId} onChange={e => { setSpecId(e.target.value); setOpen(new Set()); }}>
                  {specs.map(s => <option key={s.id} value={s.id}>{s.title || s.id}</option>)}
                </select>
                <SearchBox value={q} onChange={setQ} placeholder="Control id or name" width={240} />
                <div className="seg" role="group" aria-label="Status">
                  {STATUS_FILTERS.map(f => (
                    <button key={f} type="button" className={status === f ? 'on' : ''} aria-pressed={status === f} onClick={() => setStatus(f)}>
                      {f[0] + f.slice(1).toLowerCase()} <span className="num ml-0.5" style={{ color: 'var(--mute-2)' }}>{counts[f]}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="ctable">
                  <thead><tr>
                    <th className="w-[28px]" aria-label="Expand" />
                    <SortTh label="Status" k="status" sort={sort} onSort={onSort} className="w-[90px]" />
                    <SortTh label="Severity" k="severity" sort={sort} onSort={onSort} className="w-[100px]" />
                    <SortTh label="Control" k="id" sort={sort} onSort={onSort} className="w-[80px]" />
                    <SortTh label="Name" k="name" sort={sort} onSort={onSort} />
                    <SortTh label="Failing" k="failing_count" sort={sort} onSort={onSort} className="w-[90px]" />
                  </tr></thead>
                  <tbody>
                    {paging.slice.length === 0 && <EmptyRow cols={6}>No controls match these filters.</EmptyRow>}
                    {paging.slice.map(c => {
                      const on = open.has(c.id);
                      return (
                        <React.Fragment key={c.id}>
                          <tr className="cursor-pointer" onClick={() => toggle(c.id)}>
                            <td><ChevronRight className="w-3.5 h-3.5" aria-hidden="true" style={{ transform: on ? 'rotate(90deg)' : 'none', color: 'var(--mute)' }} /></td>
                            <td><Badge value={c.status} /></td>
                            <td><Badge value={c.severity} /></td>
                            <td className="num text-xs whitespace-nowrap">{c.id}</td>
                            <td className="font-medium">{c.name}{c.manual && <span className="ml-2 text-[11px]" style={{ color: 'var(--mute)' }}>manual check</span>}</td>
                            <td className="num text-xs">{c.failing_count}</td>
                          </tr>
                          {on && (
                            <tr><td colSpan={6} style={{ background: 'var(--panel-head)' }}>
                              <div className="flex flex-col gap-2 py-1 text-xs" style={{ color: 'var(--ink-2)' }}>
                                {c.description && <div>{c.description}</div>}
                                {c.remediation && <div><span className="font-semibold">Remediation: </span>{c.remediation}</div>}
                                {c.failing_resources.length > 0 && (
                                  <div>
                                    <div className="font-semibold mb-1">Failing resources ({c.failing_count}{c.failing_count > c.failing_resources.length ? `, first ${c.failing_resources.length} shown` : ''})</div>
                                    <ul className="num m-0 pl-4 columns-1 md:columns-2 break-all">
                                      {c.failing_resources.map(r => <li key={`${r.kind}/${r.namespace}/${r.name}`}>{r.kind}/{r.namespace ? `${r.namespace}/` : ''}{r.name}</li>)}
                                    </ul>
                                  </div>
                                )}
                                {c.manual && <div style={{ color: 'var(--mute)' }}>Trivy cannot evaluate this control automatically; it is reported as failing until verified manually.</div>}
                              </div>
                            </td></tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pager p={paging} />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
