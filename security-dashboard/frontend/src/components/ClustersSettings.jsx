import React, { useState, useEffect } from 'react';
import { useCluster } from '../cluster';

const detail = async (res) => (await res.json().catch(() => ({}))).detail || res.statusText;

// Settings -> Clusters: register kubeconfigs of other clusters to scan; 'local' is the cluster the dashboard runs in.
export default function ClustersSettings() {
    const { refresh } = useCluster();
    const [list, setList] = useState([]);
    const [name, setName] = useState('');
    const [kubeconfig, setKubeconfig] = useState('');
    const [context, setContext] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [msg, setMsg] = useState(null); // { ok, text }

    const load = async () => {
        try {
            const res = await fetch('/api/clusters');
            if (res.ok) setList(await res.json());
        } catch (err) {
            console.error('Failed to fetch clusters:', err);
        }
        refresh();
    };
    useEffect(() => { load(); }, []);

    const add = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        setMsg(null);
        try {
            const res = await fetch('/api/clusters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, kubeconfig, context }) });
            if (!res.ok) throw new Error(await detail(res));
            setName(''); setKubeconfig(''); setContext('');
            setMsg({ ok: true, text: `Cluster ${name} added.` });
            load();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const test = async (c) => {
        setMsg(null);
        try {
            const res = await fetch(`/api/clusters/${encodeURIComponent(c)}/test`, { method: 'POST' });
            if (!res.ok) throw new Error(await detail(res));
            const d = await res.json();
            setMsg({ ok: d.ok, text: d.ok ? `${c} is reachable.` : `${c}: ${d.error}` });
        } catch (err) {
            setMsg({ ok: false, text: err.message });
        }
    };

    const remove = async (c) => {
        if (!window.confirm(`Remove cluster ${c}? Its stored kubeconfig is deleted; its scan data is kept.`)) return;
        try {
            const res = await fetch(`/api/clusters/${encodeURIComponent(c)}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(await detail(res));
            setMsg({ ok: true, text: `Cluster ${c} removed.` });
            load();
        } catch (err) {
            setMsg({ ok: false, text: err.message });
        }
    };

    return (
        <div className="flex flex-col gap-[18px] max-w-4xl">
            <section className="sheet">
                <div className="phead">
                    <h2>Clusters <span className="count">{list.length}</span></h2>
                    <span className="meta">Pick the cluster to view and scan from the header</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="ctable">
                        <thead><tr><th>Name</th><th>Kind</th><th>Last scan</th><th>Status</th><th className="r">Actions</th></tr></thead>
                        <tbody>
                            {list.map((c) => (
                                <tr key={c.name}>
                                    <td className="num text-xs">{c.name}</td>
                                    <td>{c.kind === 'local' ? 'Local (ServiceAccount)' : 'Kubeconfig'}</td>
                                    <td className="num text-xs">{c.last_scan_at ? new Date(c.last_scan_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : <span style={{ color: 'var(--faint)' }}>Never</span>}</td>
                                    <td>{c.last_status ? <span style={{ color: c.last_status === 'completed' ? 'var(--ok)' : 'var(--crit)' }}>{c.last_status}</span> : <span style={{ color: 'var(--faint)' }}>—</span>}</td>
                                    <td className="r whitespace-nowrap">
                                        {c.kind !== 'local' && (
                                            <>
                                                <button type="button" className="lnk" onClick={() => test(c.name)}>Test</button>
                                                <span className="mx-1.5" style={{ color: 'var(--line-strong)' }}>·</span>
                                                <button type="button" className="lnk del" onClick={() => remove(c.name)}>Delete</button>
                                            </>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {msg && <div className={`note ${msg.ok ? 'note-ok' : 'note-crit'} m-3.5`}>{msg.text}</div>}
            </section>

            <section className="sheet">
                <div className="phead"><h2>Add cluster</h2></div>
                <form onSubmit={add} className="settings-form flex flex-col gap-5 p-5">
                    <div className="grid grid-cols-2 gap-5">
                        <label className="field">Name
                            <input type="text" required className="inp mono" placeholder="e.g. staging" pattern="[a-z0-9][a-z0-9\-]{0,30}" title="Lowercase letters, digits and dashes, up to 31 characters" value={name} onChange={(e) => setName(e.target.value)} />
                        </label>
                        <label className="field">Context (optional)
                            <input type="text" className="inp mono" placeholder="current-context" value={context} onChange={(e) => setContext(e.target.value)} />
                        </label>
                    </div>
                    <label className="field">Kubeconfig
                        <textarea required rows={10} className="inp mono" placeholder="Paste a kubeconfig with embedded credentials" spellCheck={false} value={kubeconfig} onChange={(e) => setKubeconfig(e.target.value)} />
                    </label>
                    <p className="m-0 text-[12px]" style={{ color: 'var(--mute)' }}>
                        Kubeconfigs that run commands (exec, auth-provider cmd-path) or point to local files (tokenFile, client-certificate, client-key, certificate-authority) are rejected; use an embedded token or *-data fields. The cluster is checked with a read-only request before it is saved.
                    </p>
                    {error && <div className="note note-crit">{error}</div>}
                    <div className="flex items-center gap-2.5 pt-3" style={{ borderTop: '1px solid var(--line-soft)' }}>
                        <span className="text-[11.5px]" style={{ color: 'var(--mute-2)' }}>Stored on the server, never shown again.</span>
                        <div className="flex-1" />
                        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Checking...' : 'Add cluster'}</button>
                    </div>
                </form>
            </section>
        </div>
    );
}
