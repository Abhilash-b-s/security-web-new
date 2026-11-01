import { useEffect, useState } from 'react';
import { Square } from 'lucide-react';

/** Stops a running scan (POST /api/scans/{id}/stop). The scan then ends and its report is saved as Cancelled. */
export default function StopScanButton({ scanId }) {
    const [state, setState] = useState('idle'); // idle | stopping | error
    useEffect(() => setState('idle'), [scanId]);

    const stop = async () => {
        if (!window.confirm('Stop this scan? The output so far is kept and the report is saved as Cancelled.')) return;
        setState('stopping');
        try {
            const res = await fetch(`/api/scans/${scanId}/stop`, { method: 'POST' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch {
            setState('error');
        }
    };

    return (
        <button type="button" className="btn h-[26px]" onClick={stop} disabled={state === 'stopping'}
            style={{ color: 'var(--crit)', borderColor: 'var(--crit-line)', background: 'transparent' }}
            title={state === 'error' ? 'Could not stop the scan, try again' : 'Stop this scan'}>
            <Square className="w-3 h-3" fill="currentColor" />
            {state === 'stopping' ? 'Stopping…' : state === 'error' ? 'Retry stop' : 'Stop'}
        </button>
    );
}
