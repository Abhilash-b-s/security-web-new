import React, { useEffect } from 'react';
import { X } from 'lucide-react';

// Side sheet that opens from the edge of the left rail (264px wide, below the 64px header).
export default function ScanConfirmationPanel({ isOpen, onClose, onConfirm, scanLabel, scan, cluster = 'local', lastRun, registryCount, onEditIncludes }) {
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <>
            <div className="fixed left-[264px] top-16 right-0 bottom-0 z-40" style={{ background: 'var(--scrim)' }} onClick={onClose} aria-hidden="true" />
            <aside
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirm-scan-title"
                className="fixed left-[264px] top-16 bottom-0 z-50 w-[440px] max-w-[calc(100vw-264px)] flex flex-col shadow-xl"
                style={{ background: 'var(--panel)', borderRight: '1px solid var(--line-strong)' }}
            >
                <div className="flex items-start gap-3 px-[22px] pt-[18px] pb-3.5" style={{ borderBottom: '1px solid var(--line)' }}>
                    <div className="flex-1">
                        <div className="eyebrow">Confirm scan</div>
                        <h2 id="confirm-scan-title" className="mt-0.5 font-serif text-[22px] leading-[30px] font-medium" style={{ color: 'var(--ink)' }}>{scanLabel}</h2>
                        {scan?.about && <p className="mt-1 text-[12.5px]" style={{ color: 'var(--mute)' }}>{scan.about}</p>}
                    </div>
                    <button type="button" className="btn w-7 px-0" onClick={onClose} aria-label="Close panel">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-[22px] pt-1.5 pb-4">
                    <dl className="grid grid-cols-[120px_1fr] text-[13px] m-0">
                        {[
                            scan?.includes
                                ? ['Includes', <span>
                                    {scan.includes.map(t => <span key={t.id} className="block">{t.label} <span className="num text-[11px]" style={{ color: 'var(--mute-2)' }}>{t.tool}</span></span>)}
                                    <button type="button" className="lnk mt-1" onClick={onEditIncludes}>Change in Settings</button>
                                  </span>]
                                : ['Scanner', <span className="num text-xs">{scan?.tool}</span>],
                            ['Target', cluster === 'local' ? 'Local cluster (the one the dashboard runs in)' : <span>Cluster <span className="num text-xs">{cluster}</span> (registered kubeconfig)</span>],
                            ...(scan?.id === 'trivy-image' ? [['Registries', `${registryCount} configured`]] : []),
                            ['Last run', lastRun
                                ? <span><span className="num text-xs">{new Date(lastRun.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span> · <span style={{ color: lastRun.status === 'completed' ? 'var(--ok)' : 'var(--crit)' }}>{lastRun.status}</span></span>
                                : <span style={{ color: 'var(--faint)' }}>Never</span>],
                        ].map(([k, v]) => (
                            <React.Fragment key={k}>
                                <dt className="py-2" style={{ color: 'var(--mute)', borderBottom: '1px solid var(--line-soft)' }}>{k}</dt>
                                <dd className="py-2 m-0" style={{ color: 'var(--ink)', borderBottom: '1px solid var(--line-soft)' }}>{v}</dd>
                            </React.Fragment>
                        ))}
                    </dl>

                    <p className="mt-3 text-[12.5px] leading-[18px]" style={{ color: 'var(--mute)' }}>
                        The scan runs in the background. Follow its progress in Event logs, where it appears at the top of Runs while it runs.
                    </p>
                </div>

                <div className="flex items-center gap-2.5 px-[22px] py-3" style={{ borderTop: '1px solid var(--line)', background: 'var(--panel-head)' }}>
                    <div className="flex-1" />
                    <button type="button" className="btn h-8" onClick={onClose}>Cancel</button>
                    <button type="button" className="btn btn-primary h-8 px-4" onClick={onConfirm} autoFocus>
                        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 1l6 4-6 4z" fill="currentColor" /></svg>
                        Start scan
                    </button>
                </div>
            </aside>
        </>
    );
}
