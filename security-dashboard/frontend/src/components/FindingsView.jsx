import React, { useMemo, useState } from 'react';
import { X, Copy, Download } from 'lucide-react';
import { Badge, SEV_ORDER, SEV_COLOR, countBy, FigureStrip, ToggleGroup, SearchBox, useSort, sortRows, SortTh, usePaging, Pager, EmptyRow, downloadCsv } from './reportParts';

const ALL_SEV = { CRITICAL: true, HIGH: true, MEDIUM: true, LOW: true, UNKNOWN: true };
const hasFix = (r) => r.fixed && r.fixed !== 'N/A';
const keyOf = (r) => `${r.id}|${r.pkg}|${r.target}`;
const nvd = (id) => (id && id.startsWith('CVE-') ? `https://nvd.nist.gov/vuln/detail/${id}` : null);

function Cvss({ score, severity }) {
  if (score == null) return <span style={{ color: 'var(--faint)' }}>—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="w-12 h-1.5 inline-block" style={{ background: 'var(--line-soft)' }}>
        <span className="block h-full" style={{ width: `${score * 10}%`, background: SEV_COLOR[severity] || 'var(--faint)' }} />
      </span>
      <span className="num text-xs">{score.toFixed(1)}</span>
    </span>
  );
}

/**
 * Vulnerability findings table shared by the Images, SBOM and Repositories tabs.
 * rows: [{ severity, id, pkg, installed, fixed, cvss, title, target, refs, type? }]
 */
export const DEFAULT_FINDING_FILTERS = { sev: ALL_SEV, q: '', fixOnly: false };

export default function FindingsView({
  rows, scanType, title, controls, exportHref, exportName, showType = false, emptyText, figuresOverride,
  isSuppressed, onSuppress, onUnsuppress, showSuppressed, setShowSuppressed,
  filters, onFilters,
}) {
  // Filters are owned by the parent so they survive switching tabs.
  const { sev = ALL_SEV, q = '', fixOnly = false } = filters || {};
  const set = (patch) => onFilters({ sev, q, fixOnly, ...patch });
  const setSev = (v) => set({ sev: v });
  const setQ = (v) => set({ q: v });
  const setFixOnly = (v) => set({ fixOnly: v });
  const [detail, setDetail] = useState(null);
  const [sort, onSort] = useSort('cvss', 'desc');

  const suppressedCount = rows.filter(r => isSuppressed(r.id, r.pkg)).length;
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = rows
      .filter(r => sev[r.severity] ?? true)
      .filter(r => !fixOnly || hasFix(r))
      .filter(r => showSuppressed || !isSuppressed(r.id, r.pkg))
      .filter(r => !needle || [r.id, r.pkg, r.target, r.title].some(v => String(v || '').toLowerCase().includes(needle)));
    // Grouped by severity, then by the chosen column.
    const sorted = sortRows(base, sort);
    return sorted.sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));
  }, [rows, sev, fixOnly, showSuppressed, q, sort, isSuppressed]);

  const paging = usePaging(filtered, `${q}|${fixOnly}|${JSON.stringify(sev)}|${showSuppressed}|${rows.length}`);
  const sevCounts = countBy(rows, 'severity');
  const groupTotals = countBy(filtered, 'severity');

  const exportRows = (list, name) => downloadCsv(name, ['Severity', 'ID', 'Package', 'Installed', 'Fixed', 'CVSS', 'Target', 'Title'],
    list.map(r => [r.severity, r.id, r.pkg, r.installed, r.fixed, r.cvss ?? '', r.target, r.title]));

  const figures = figuresOverride || [
    ...['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(s => ({
      label: s[0] + s.slice(1).toLowerCase(), swatch: SEV_COLOR[s], value: sevCounts[s] || 0,
      color: s === 'CRITICAL' && sevCounts[s] ? 'var(--crit)' : undefined,
      note: `${rows.filter(r => r.severity === s && hasFix(r)).length} fixable`,
    })),
    { label: 'Total', value: rows.length, note: `${rows.filter(hasFix).length} fixable · ${suppressedCount} suppressed` },
  ];

  const wide = !detail; // Target and Title move into the detail panel while it is open
  const cols = (showType ? 8 : 7) - (wide ? 0 : 2);
  let lastSev = null;

  return (
    <div className="flex flex-col gap-3.5">
      <FigureStrip items={figures} />

      <div className={`grid gap-[18px] items-start ${detail ? 'grid-cols-[minmax(0,1fr)_360px]' : 'grid-cols-1'}`}>
        <section className="sheet min-w-0">
          <div className="phead flex-wrap">
            <h2>{title} <span className="count">{filtered.length}</span></h2>
            <span className="meta">Grouped by severity · sorted by {sort.key === 'cvss' ? 'CVSS' : sort.key}</span>
            <div className="flex-1" />
            <button type="button" className="btn h-[26px]" onClick={() => exportRows(filtered, `${scanType}-findings.csv`)} disabled={!filtered.length}>
              <Download className="w-3 h-3" /> CSV
            </button>
            {exportHref && (
              <a className="btn h-[26px] no-underline" href={exportHref} download={exportName}>
                <Download className="w-3 h-3" /> Excel
              </a>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 px-3.5 py-2" style={{ background: 'var(--panel-head)', borderBottom: '1px solid var(--line)' }}>
            {controls}
            <SearchBox value={q} onChange={setQ} placeholder="CVE, package or target" width={240} />
            <ToggleGroup label="Severity" keys={SEV_ORDER} value={sev} onChange={setSev} counts={sevCounts} />
            <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--ink-2)' }}>
              <input type="checkbox" checked={fixOnly} onChange={e => setFixOnly(e.target.checked)} /> Fix available
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--ink-2)' }}>
              <input type="checkbox" checked={showSuppressed} onChange={e => setShowSuppressed(e.target.checked)} /> Suppressed <span className="num" style={{ color: 'var(--mute-2)' }}>{suppressedCount}</span>
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="ctable">
              <thead><tr>
                <SortTh label="ID" k="id" sort={sort} onSort={onSort} />
                {showType && <SortTh label="Type" k="type" sort={sort} onSort={onSort} />}
                <SortTh label="Package" k="pkg" sort={sort} onSort={onSort} />
                <th>Installed → fixed</th>
                {wide && <SortTh label="Target" k="target" sort={sort} onSort={onSort} />}
                {wide && <th>Title</th>}
                <SortTh label="CVSS" k="cvss" sort={sort} onSort={onSort} className="w-[110px]" />
                <th className="w-[92px]" aria-label="Actions" />
              </tr></thead>
              <tbody>
                {paging.slice.map(r => {
                  const head = r.severity !== lastSev;
                  lastSev = r.severity;
                  const sup = isSuppressed(r.id, r.pkg);
                  const on = detail && keyOf(detail) === keyOf(r);
                  return (
                    <React.Fragment key={keyOf(r)}>
                      {head && (
                        <tr><td colSpan={cols} className="!py-1.5" style={{ background: 'var(--panel-head)', boxShadow: `inset 3px 0 0 ${SEV_COLOR[r.severity] || 'var(--faint)'}` }}>
                          <Badge value={r.severity} /> <span className="num text-[11px] ml-1.5" style={{ color: 'var(--mute)' }}>{groupTotals[r.severity]} findings</span>
                        </td></tr>
                      )}
                      <tr className="cursor-pointer" onClick={() => setDetail(r)} style={{ opacity: sup ? 0.5 : 1 }}>
                        <td className="num text-xs whitespace-nowrap" style={on ? { background: 'var(--accent-tint)', boxShadow: 'inset 3px 0 0 var(--accent-text)' } : undefined}>
                          {nvd(r.id) ? <a href={nvd(r.id)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: 'var(--accent-text)' }}>{r.id}</a> : r.id}
                        </td>
                        {showType && <td style={on ? { background: 'var(--accent-tint)' } : undefined}>{r.type}</td>}
                        <td className="font-medium max-w-[160px] break-words" style={on ? { background: 'var(--accent-tint)' } : undefined}>{r.pkg}</td>
                        <td className="num text-xs max-w-[190px] break-all" style={on ? { background: 'var(--accent-tint)' } : undefined}>
                          <span style={{ color: hasFix(r) ? 'var(--crit)' : 'var(--ink-2)' }}>{r.installed}</span>
                          {hasFix(r)
                            ? <><span style={{ color: 'var(--faint)' }}> → </span><span style={{ color: 'var(--ok)' }}>{r.fixed}</span></>
                            : <span className="ml-1.5 text-[11px]" style={{ color: 'var(--faint)' }}>no fix</span>}
                        </td>
                        {wide && <td className="num text-[11.5px] max-w-[170px] truncate" title={r.target} style={on ? { background: 'var(--accent-tint)', color: 'var(--mute)' } : { color: 'var(--mute)' }}>{r.target}</td>}
                        {wide && <td className="max-w-[240px] truncate" title={r.title} style={on ? { background: 'var(--accent-tint)' } : undefined}>{r.title}</td>}
                        <td style={on ? { background: 'var(--accent-tint)' } : undefined}><Cvss score={r.cvss} severity={r.severity} /></td>
                        <td className="text-right" style={on ? { background: 'var(--accent-tint)' } : undefined} onClick={e => e.stopPropagation()}>
                          {sup
                            ? <button type="button" className="lnk" onClick={() => onUnsuppress(r.id, r.pkg)}>Unsuppress</button>
                            : <button type="button" className="lnk" style={{ color: 'var(--mute)' }} onClick={() => onSuppress([{ cve_id: r.id, pkg: r.pkg, scan_type: scanType }])}>Suppress</button>}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
                {filtered.length === 0 && <EmptyRow cols={cols}>{emptyText || 'No findings match these filters.'}</EmptyRow>}
              </tbody>
            </table>
          </div>
          <Pager p={paging} note={!showSuppressed && suppressedCount ? `${suppressedCount} suppressed hidden` : ''} />
        </section>

        {detail && (
          <aside className="sheet sticky top-0" aria-label="Finding detail">
            <div className="px-4 pt-3 pb-3" style={{ borderBottom: '1px solid var(--line)' }}>
              <div className="flex items-center gap-2">
                <Badge value={detail.severity} />
                <span className="text-[10.5px] font-semibold tracking-[.06em]" style={{ color: hasFix(detail) ? 'var(--ok)' : 'var(--mute-2)' }}>{hasFix(detail) ? 'FIX AVAILABLE' : 'NO FIX YET'}</span>
                <div className="flex-1" />
                <button type="button" className="btn w-7 h-7 px-0" aria-label="Close detail" onClick={() => setDetail(null)}><X className="w-3.5 h-3.5" /></button>
              </div>
              <h2 className="num mt-2 text-[17px] font-medium break-all" style={{ color: 'var(--ink)' }}>{detail.id}</h2>
            </div>
            <div className="px-4 py-3 flex flex-col gap-3">
              {detail.title && <p className="m-0 text-[13px] leading-5" style={{ color: 'var(--ink-2)' }}>{detail.title}</p>}
              <div className="grid grid-cols-2" style={{ border: '1px solid var(--line-soft)' }}>
                <div className="px-3 py-2"><div className="text-[11px]" style={{ color: 'var(--mute)' }}>CVSS</div><div className="num text-lg" style={{ color: SEV_COLOR[detail.severity] }}>{detail.cvss != null ? detail.cvss.toFixed(1) : '—'}</div></div>
                <div className="px-3 py-2" style={{ borderLeft: '1px solid var(--line-soft)' }}><div className="text-[11px]" style={{ color: 'var(--mute)' }}>Same ID in report</div><div className="num text-lg">{rows.filter(r => r.id === detail.id).length}</div></div>
              </div>
              <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 m-0 text-[12.5px]">
                <dt style={{ color: 'var(--mute)' }}>Package</dt><dd className="m-0 num text-xs break-all">{detail.pkg || '—'}</dd>
                <dt style={{ color: 'var(--mute)' }}>Upgrade path</dt>
                <dd className="m-0 num text-xs">{hasFix(detail) ? <><span style={{ color: 'var(--crit)' }}>{detail.installed}</span> → <span style={{ color: 'var(--ok)' }}>{detail.fixed}</span></> : <>{detail.installed} <span style={{ color: 'var(--faint)' }}>(no fix)</span></>}</dd>
                <dt style={{ color: 'var(--mute)' }}>Target</dt><dd className="m-0 num text-xs break-all">{detail.target || '—'}</dd>
                <dt style={{ color: 'var(--mute)' }}>References</dt>
                <dd className="m-0 flex flex-col gap-0.5 min-w-0">
                  {nvd(detail.id) && <a className="text-xs truncate" href={nvd(detail.id)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-text)' }}>nvd.nist.gov</a>}
                  {(detail.refs || []).slice(0, 3).map(u => <a key={u} className="text-xs truncate" href={u} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-text)' }}>{u.replace(/^https?:\/\//, '')}</a>)}
                  {!nvd(detail.id) && !(detail.refs || []).length && <span style={{ color: 'var(--faint)' }}>—</span>}
                </dd>
              </dl>
              <div className="flex gap-2 pt-3" style={{ borderTop: '1px solid var(--line-soft)' }}>
                {isSuppressed(detail.id, detail.pkg)
                  ? <button type="button" className="btn" onClick={() => onUnsuppress(detail.id, detail.pkg)}>Unsuppress</button>
                  : <button type="button" className="btn btn-primary" onClick={() => onSuppress([{ cve_id: detail.id, pkg: detail.pkg, scan_type: scanType }])}>Suppress finding…</button>}
                <button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(detail.id)}><Copy className="w-3 h-3" /> Copy ID</button>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
