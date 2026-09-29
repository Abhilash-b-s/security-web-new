import React, { useState, useEffect } from 'react';
import { Edit } from 'lucide-react';
import PageHead from './PageHead';
import PasswordInput from './PasswordInput';

export default function Settings({ initialSection = null }) {
    const [registries, setRegistries] = useState([]);
    const [activeSection, setActiveSection] = useState(initialSection || 'registry');
    const [editingId, setEditingId] = useState(null);

    // Registry Form State
    const [url, setUrl] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Git Config State
    const [gitUsername, setGitUsername] = useState('');
    const [gitToken, setGitToken] = useState('');
    const [gitRepos, setGitRepos] = useState('');
    const [gitLoading, setGitLoading] = useState(false);
    const [gitError, setGitError] = useState(null);

    const [gitSuccess, setGitSuccess] = useState(null);
    const [isEditingGit, setIsEditingGit] = useState(false);

    // Suppressions (managed here; created from Scan reports)
    const [suppressions, setSuppressions] = useState([]);
    const fetchSuppressions = async () => {
        try {
            const res = await fetch('/api/suppressions/');
            if (res.ok) setSuppressions(await res.json());
        } catch (err) {
            console.error("Failed to fetch suppressions:", err);
        }
    };
    const removeSuppression = async (id) => {
        try {
            const res = await fetch(`/api/suppressions/${id}`, { method: 'DELETE' });
            if (res.ok) setSuppressions(prev => prev.filter(x => x.id !== id));
        } catch (err) {
            console.error("Failed to remove suppression:", err);
        }
    };
    useEffect(() => { fetchSuppressions(); }, []);

    useEffect(() => {
        if (initialSection) {
            setActiveSection(initialSection);
        }
    }, [initialSection]);

    useEffect(() => {
        if (activeSection === 'registry') {
            fetchRegistries();
        } else if (activeSection === 'git') {
            fetchGitConfig();
        }
    }, [activeSection]);

    const fetchGitConfig = async () => {
        try {
            const response = await fetch('/api/settings/git-config');
            if (response.ok) {
                const data = await response.json();
                setGitUsername(data.username || '');
                setGitToken(data.token || '');
                setGitRepos(data.repos || '');
            }
        } catch (err) {
            console.error("Failed to fetch git config:", err);
        }
    };

    const handleSaveGitConfig = async (e) => {
        e.preventDefault();
        setGitLoading(true);
        setGitError(null);
        setGitSuccess(null);

        try {
            const config = { username: gitUsername, token: gitToken, repos: gitRepos };
            const response = await fetch('/api/settings/git-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });

            if (response.ok) {
                setGitSuccess("Git configuration saved successfully!");
                window.dispatchEvent(new Event('scan-settings-changed'));
                setIsEditingGit(false);
                setTimeout(() => setGitSuccess(null), 3000);
            } else {
                setGitError("Failed to save git configuration");
            }
        } catch (err) {
            setGitError("Error saving configuration: " + err.message);
        } finally {
            setGitLoading(false);
        }
    };

    const fetchRegistries = async () => {
        try {
            // In dev environment, this might need full URL if not proxied, 
            // but in docker/k8s relative path should work if served from same origin or proxy set up.
            // Assuming relative path for now as per other components.
            const response = await fetch('/api/settings/registries');
            if (response.ok) {
                const data = await response.json();
                setRegistries(data);
            }
        } catch (err) {
            console.error("Failed to fetch registries:", err);
        }
    };

    const handleAddRegistry = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const newRegistry = { url, username, password };

            let response;
            if (editingId) {
                response = await fetch('/api/settings/registries/' + editingId, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newRegistry)
                });
            } else {
                response = await fetch('/api/settings/registries', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newRegistry)
                });
            }

            if (response.ok) {
                window.dispatchEvent(new Event('scan-settings-changed'));
                await fetchRegistries();
                setUrl('');
                setUsername('');
                setPassword('');
                setEditingId(null);
            } else {
                setError(editingId ? 'Failed to update registry' : 'Failed to add registry');
            }
        } catch (err) {
            setError(editingId ? 'Error updating registry' : 'Error adding registry');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteRegistry = async (id) => {
        try {
            // Use normalized API path and ID interpolation
            const deleteUri = '/api/settings/registries/' + id;
            const response = await fetch(deleteUri, { method: 'DELETE' });
            if (response.ok) {
                window.dispatchEvent(new Event('scan-settings-changed'));
                fetchRegistries();
            }
        } catch (err) {
            console.error("Failed to delete registry:", err);
        }
    };

    const handleEditRegistry = (reg) => {
        setEditingId(reg.id);
        setUrl(reg.url);
        setUsername(reg.username);
        setPassword(''); // Clear password for security, user can leave blank to keep existing
        document.getElementById('registry-form')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setUrl('');
        setUsername('');
        setPassword('');
        setError(null);
    };

    // Navigation Items
    const navItems = [
        { id: 'registry', label: 'Container registries', count: registries.length || null },
        { id: 'git', label: 'Git repositories' },
        { id: 'suppressions', label: 'Suppressions', count: suppressions.length || null },
    ];

    const repoCount = gitRepos.split('\n').filter(r => r.trim() && !r.trim().startsWith('#')).length;

    return (
        <div className="flex-1 min-h-0 overflow-auto px-7 pt-[18px] pb-6">
            <PageHead title="Settings" sub="Credentials used by the scanners, stored on the dashboard server" />

            <div className="mt-3.5 grid grid-cols-[200px_1fr] gap-[18px] items-start">
                <nav className="flex flex-col gap-1" aria-label="Settings sections">
                    {navItems.map((item) => {
                        const on = activeSection === item.id;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setActiveSection(item.id)}
                                aria-current={on ? 'true' : undefined}
                                className="flex justify-between items-center px-2.5 py-[7px] text-[13px] text-left rounded-md cursor-pointer"
                                style={{
                                    font: 'inherit',
                                    color: on ? 'var(--ink)' : 'var(--ink-2)',
                                    fontWeight: on ? 600 : 400,
                                    background: on ? 'var(--panel)' : 'transparent',
                                    border: `1px solid ${on ? 'var(--btn-line)' : 'transparent'}`,
                                    borderLeft: on ? '3px solid var(--accent-text)' : '1px solid transparent',
                                }}
                            >
                                {item.label}
                                {item.count && <span className="num text-[11px] font-normal" style={{ color: 'var(--mute-2)' }}>{item.count}</span>}
                            </button>
                        );
                    })}
                </nav>

                {activeSection === 'registry' && (
                    <div className="flex flex-col gap-[18px] max-w-4xl">
                        <section className="sheet">
                            <div className="phead">
                                <h2>Container registries <span className="count">{registries.length}</span></h2>
                                <span className="meta">Trivy logs in to each registry before scanning</span>
                            </div>
                            {registries.length === 0 ? (
                                <p className="m-0 px-3.5 py-4 text-[13px]" style={{ color: 'var(--mute)' }}>No registries configured yet.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="ctable">
                                        <thead><tr><th>Registry URL</th><th>Username</th><th>Password</th><th className="r">Actions</th></tr></thead>
                                        <tbody>
                                            {Array.isArray(registries) && registries.map((reg) => (
                                                <tr key={reg.id} style={editingId === reg.id ? { boxShadow: 'inset 3px 0 0 var(--accent-text)' } : undefined}>
                                                    <td className="num text-xs">{reg.url}</td>
                                                    <td>{reg.username}</td>
                                                    <td className="num" style={{ color: 'var(--faint)' }}>••••••••</td>
                                                    <td className="r whitespace-nowrap">
                                                        <button type="button" className="lnk" onClick={() => handleEditRegistry(reg)} title="Edit Registry">Edit</button>
                                                        <span className="mx-1.5" style={{ color: 'var(--line-strong)' }}>·</span>
                                                        <button type="button" className="lnk del" onClick={() => handleDeleteRegistry(reg.id)} title="Delete Registry">Delete</button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>

                        <section className="sheet" id="registry-form">
                            <div className="phead"><h2>{editingId ? 'Edit registry' : 'Add registry'}</h2></div>
                            <form onSubmit={handleAddRegistry} className="settings-form flex flex-col gap-5 p-5">
                                <label className="field">Registry URL
                                    <input type="text" required className="inp mono" placeholder="e.g. docker.io" value={url} onChange={(e) => setUrl(e.target.value)} />
                                </label>
                                <div className="grid grid-cols-2 gap-5">
                                    <label className="field">Username
                                        <input type="text" required className="inp" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
                                    </label>
                                    <label className="field">Password / token
                                        <PasswordInput required className="inp" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
                                    </label>
                                </div>
                                {error && <div className="note note-crit">{error}</div>}
                                <div className="flex items-center gap-2.5 pt-3" style={{ borderTop: '1px solid var(--line-soft)' }}>
                                    <span className="text-[11.5px]" style={{ color: 'var(--mute-2)' }}>Saved to registries.json on the server.</span>
                                    <div className="flex-1" />
                                    {editingId && <button type="button" className="btn" onClick={handleCancelEdit}>Cancel</button>}
                                    <button type="submit" className="btn btn-primary" disabled={loading}>
                                        {loading ? (editingId ? 'Updating...' : 'Adding...') : (editingId ? 'Update credential' : 'Save credential')}
                                    </button>
                                </div>
                            </form>
                        </section>
                    </div>
                )}

                {activeSection === 'suppressions' && (
                    <section className="sheet">
                        <div className="phead">
                            <h2>Suppressions <span className="count">{suppressions.length}</span></h2>
                            <span className="meta">Findings hidden from Scan reports. Add them from a finding's Suppress action.</span>
                        </div>
                        {suppressions.length === 0 ? (
                            <p className="m-0 px-3.5 py-4 text-[13px]" style={{ color: 'var(--mute)' }}>No findings are suppressed.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="ctable">
                                    <thead><tr><th>Finding</th><th>Package</th><th>Scan</th><th>Reason</th><th>Note</th><th>Added</th><th className="r">Actions</th></tr></thead>
                                    <tbody>
                                        {suppressions.map(x => (
                                            <tr key={x.id}>
                                                <td className="num text-xs">{x.cve_id}</td>
                                                <td>{x.pkg || '—'}</td>
                                                <td className="num text-xs">{x.scan_type}</td>
                                                <td><span className={`badge ${x.reason === 'false-positive' ? 'badge-low' : 'badge-warn'}`}>{x.reason === 'false-positive' ? 'False positive' : 'Accepted risk'}</span></td>
                                                <td className="max-w-[280px] truncate" title={x.note} style={{ color: 'var(--mute)' }}>{x.note || '—'}</td>
                                                <td className="num text-xs whitespace-nowrap" style={{ color: 'var(--mute)' }}>{x.created_at ? new Date(x.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</td>
                                                <td className="r"><button type="button" className="lnk del" onClick={() => removeSuppression(x.id)}>Remove</button></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                )}

                {activeSection === 'git' && (
                    <section className="sheet max-w-3xl">
                        <div className="phead">
                            <h2>Git repositories</h2>
                            <span className="meta">Used by the Source code scan</span>
                            <div className="flex-1" />
                            {!isEditingGit && <span className="badge badge-mute">Read only</span>}
                        </div>
                        <p className="m-0 px-3.5 py-2.5 text-[12.5px]" style={{ color: 'var(--mute)', borderBottom: '1px solid var(--line-soft)' }}>
                            The token is used to clone private repositories.
                        </p>
                        <form onSubmit={handleSaveGitConfig} className="settings-form flex flex-col gap-5 p-5">
                            <div className="grid grid-cols-2 gap-5">
                                <label className="field">Git username
                                    <input type="text" required disabled={!isEditingGit} className="inp" placeholder="e.g. abhilash-armada-ai" value={gitUsername} onChange={(e) => setGitUsername(e.target.value)} />
                                </label>
                                <label className="field">Access token
                                    <PasswordInput required disabled={!isEditingGit} className="inp" placeholder="Access Token" value={gitToken} onChange={(e) => setGitToken(e.target.value)} />
                                </label>
                            </div>
                            <label className="field">Repository URLs <span className="hint">One per line. Lines starting with # are ignored.</span>
                                <textarea required disabled={!isEditingGit} rows={8} className="inp mono resize-y" placeholder="https://gitlab.com/example/repo.git" value={gitRepos} onChange={(e) => setGitRepos(e.target.value)} />
                            </label>

                            {gitError && <div className="note note-crit">{gitError}</div>}
                            {gitSuccess && <div className="note note-ok">{gitSuccess}</div>}

                            <div className="flex items-center gap-2.5 pt-3" style={{ borderTop: '1px solid var(--line-soft)' }}>
                                <span className="num text-[11.5px]" style={{ color: 'var(--mute-2)' }}>{repoCount} {repoCount === 1 ? 'repository' : 'repositories'}</span>
                                <div className="flex-1" />
                                {!isEditingGit ? (
                                    <button type="button" className="btn btn-primary" onClick={() => setIsEditingGit(true)}>
                                        <Edit className="w-3.5 h-3.5" /> Edit configuration
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            className="btn"
                                            onClick={() => {
                                                setIsEditingGit(false);
                                                fetchGitConfig(); // Revert changes
                                            }}
                                        >
                                            Cancel
                                        </button>
                                        <button type="submit" className="btn btn-primary" disabled={gitLoading}>
                                            {gitLoading ? 'Saving...' : 'Save configuration'}
                                        </button>
                                    </>
                                )}
                            </div>
                        </form>
                    </section>
                )}
            </div>
        </div>
    );
}
