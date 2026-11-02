import { useEffect, useRef, useState } from 'react';

/** Confirmation for removing a cluster. "Also delete its scan data" is off by default (the history is kept). */
export default function DeleteClusterDialog({ name, busy, onCancel, onConfirm }) {
    const ref = useRef(null);
    const [deleteData, setDeleteData] = useState(false);

    useEffect(() => {
        const d = ref.current;
        if (d && !d.open) d.showModal();
        return () => { if (d?.open) d.close(); };
    }, []);

    return (
        <dialog ref={ref} className="dlg" aria-labelledby="del-cluster-title" onCancel={(e) => { e.preventDefault(); if (!busy) onCancel(); }}>
            <h2 id="del-cluster-title" className="m-0 mb-2 text-[15px] font-semibold">Remove cluster {name}?</h2>
            <p className="m-0 mb-3 text-[13px]" style={{ color: 'var(--ink-2)' }}>
                Its stored kubeconfig is deleted and it disappears from the cluster list and schedules.
            </p>
            <label className="flex items-start gap-2 text-[13px] cursor-pointer mb-1">
                <input type="checkbox" className="mt-0.5" checked={deleteData} onChange={(e) => setDeleteData(e.target.checked)} disabled={busy} />
                <span>
                    Also delete its scan data
                    <span className="block text-xs" style={{ color: 'var(--mute)' }}>
                        Reports, run history, findings and its schedule. This cannot be undone. Leave it off to keep the history of a retired cluster.
                    </span>
                </span>
            </label>
            <div className="flex justify-end gap-2 mt-4">
                <button type="button" className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
                <button type="button" className="btn" disabled={busy} onClick={() => onConfirm(deleteData)}
                    style={{ color: 'var(--crit)', borderColor: 'var(--crit-line)' }}>
                    {busy ? 'Removing…' : deleteData ? 'Remove cluster and data' : 'Remove cluster'}
                </button>
            </div>
        </dialog>
    );
}
