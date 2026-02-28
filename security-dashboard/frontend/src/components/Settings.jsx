import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Globe, Database, Settings as SettingsIcon, Edit, X } from 'lucide-react';

export default function Settings({ initialSection = null }) {
    const [registries, setRegistries] = useState([]);
    const [activeSection, setActiveSection] = useState(null); // Default to null (no section selected)
    const [editingId, setEditingId] = useState(null);

    // Registry Form State
    const [url, setUrl] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
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
        window.scrollTo({ top: 0, behavior: 'smooth' });
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
        { id: 'registry', label: 'Registry Management', icon: <Database className="w-4 h-4" /> },
        { id: 'git', label: 'Git Configuration', icon: <SettingsIcon className="w-4 h-4" /> }
    ];

    const baseButtonClasses = 'w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ';

    return (
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden h-full">
            {/* Left Sidebar - Full height, extends to left margin */}
            <div className="w-full lg:w-72 flex-shrink-0 bg-white dark:bg-gray-800 border-r border-slate-200 dark:border-gray-700 flex flex-col">
                <div className="p-6 border-b border-slate-200 dark:border-gray-700">
                    <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-900 dark:text-white">
                        <div className="p-2 bg-gradient-blue rounded-lg">
                            <SettingsIcon className="w-5 h-5 text-azure-600" />
                        </div>
                        Settings
                    </h2>
                </div>
                <nav className="flex-1 flex flex-col overflow-y-auto bg-white dark:bg-gray-800">
                    {navItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => setActiveSection(item.id)}
                            className={`flex items-center gap-3 py-3 px-6 border-b border-slate-200 dark:border-gray-700 transition-all duration-150 w-full font-medium text-sm transform ${activeSection === item.id
                                ? 'bg-azure-100 dark:bg-azure-600/20 text-azure-800 dark:text-azure-100 border-l-4 border-l-azure-500 shadow-md'
                                : 'bg-white dark:bg-gray-800 hover:bg-azure-100 dark:hover:bg-azure-600/20 text-slate-900 dark:text-gray-200 hover:text-azure-800 dark:hover:text-azure-100 hover:border-l-4 hover:border-l-azure-500 hover:shadow-xl hover:shadow-azure-500/30 hover:scale-[1.02] hover:-translate-x-1 active:scale-[0.98] active:shadow-inner'
                                }`}
                        >
                            <div className={`p-2 rounded-lg transition-all duration-200 ${activeSection === item.id ? 'bg-azure-100 dark:bg-azure-500/20 text-azure-700 dark:text-azure-400' : 'bg-slate-100 dark:bg-gray-700 text-azure-700 dark:text-azure-400'}`}>
                                {item.icon}
                            </div>
                            <span>{item.label}</span>
                        </button>
                    ))}
                </nav>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 min-w-0 overflow-auto bg-gray-50 dark:bg-gray-900 p-6 transition-colors duration-200">
                <div className="max-w-4xl mx-auto space-y-8">

                    {/* Render Content Based on Active Section */}
                    {!activeSection && (
                        <div className="flex flex-col items-center justify-center h-[50vh] text-black dark:text-gray-500">
                            <SettingsIcon className="w-16 h-16 mb-4 opacity-20" />
                            <p className="text-lg">Select a category from the sidebar to configure settings.</p>
                        </div>
                    )}

                    {activeSection === 'git' && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            <div>
                                <h1 className="text-2xl font-bold mb-2 text-slate-900 dark:text-white">Git Configuration</h1>
                                <p className="text-black dark:text-gray-400">Configure credentials for Git Repository scanning. The token will be used to clone private repositories.</p>
                            </div>

                            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-300 dark:border-gray-700 p-6 shadow-sm">
                                <form onSubmit={handleSaveGitConfig} className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-black dark:text-gray-400 mb-1">Git Username</label>
                                            <input
                                                type="text"
                                                required
                                                disabled={!isEditingGit}
                                                placeholder="e.g. abhilash-armada-ai"
                                                value={gitUsername}
                                                onChange={(e) => setGitUsername(e.target.value)}
                                                className={`w-full bg-gray-50 dark:bg-gray-900 border-[3px] border-slate-400 dark:border-gray-600 rounded-lg py-2 px-4 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 transition-colors text-gray-900 dark:text-white ${!isEditingGit ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-black dark:text-gray-400 mb-1">Git Access Token</label>
                                            <input
                                                type="password"
                                                required
                                                disabled={!isEditingGit}
                                                placeholder="Access Token"
                                                value={gitToken}
                                                onChange={(e) => setGitToken(e.target.value)}
                                                className={`w-full bg-gray-50 dark:bg-gray-900 border-[3px] border-slate-400 dark:border-gray-600 rounded-lg py-2 px-4 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 transition-colors text-gray-900 dark:text-white ${!isEditingGit ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-black dark:text-gray-400 mb-1">Repository URLs (One per line)</label>
                                        <textarea
                                            required
                                            disabled={!isEditingGit}
                                            rows={6}
                                            placeholder="https://gitlab.com/example/repo.git"
                                            value={gitRepos}
                                            onChange={(e) => setGitRepos(e.target.value)}
                                            className={`w-full bg-gray-50 dark:bg-gray-900 border-[3px] border-slate-400 dark:border-gray-600 rounded-lg py-2 px-4 text-sm font-mono focus:border-blue-500 focus:ring-2 focus:ring-blue-500 transition-colors text-gray-900 dark:text-white ${!isEditingGit ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        />
                                        <p className="text-xs text-black dark:text-gray-500 mt-1">Comments starting with # are ignored.</p>
                                    </div>

                                    {gitError && <p className="text-red-500 dark:text-red-400 text-sm">{gitError}</p>}
                                    {gitSuccess && <p className="text-green-600 dark:text-green-400 text-sm">{gitSuccess}</p>}

                                    <div className="flex justify-end gap-3">
                                        {!isEditingGit ? (
                                            <button
                                                type="button"
                                                onClick={() => setIsEditingGit(true)}
                                                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-500/20 flex items-center gap-2"
                                            >
                                                <Edit className="w-4 h-4" /> Edit Configuration
                                            </button>
                                        ) : (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setIsEditingGit(false);
                                                        fetchGitConfig(); // Revert changes
                                                    }}
                                                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-black dark:text-white rounded-lg text-sm font-medium transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    type="submit"
                                                    disabled={gitLoading}
                                                    className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-500/20"
                                                >
                                                    {gitLoading ? 'Saving...' : 'Save Configuration'}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}

                    {activeSection === 'registry' && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            <div>
                                <h1 className="text-2xl font-bold mb-2 text-slate-900 dark:text-white">Registry Management</h1>
                                <p className="text-black dark:text-gray-400">Configure container registries for Trivy authentication. The scanner will attempt to log in to all configured registries before scanning.</p>
                            </div>

                            {/* Add Registry Form */}
                            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-300 dark:border-gray-700 p-6 shadow-sm">
                                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
                                    <Plus className="w-5 h-5 text-green-600 dark:text-green-400" />
                                    {editingId ? 'Edit Registry' : 'Add New Registry'}
                                </h3>
                                <form onSubmit={handleAddRegistry} className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-black dark:text-gray-400 mb-1">Registry URL</label>
                                            <div className="relative">
                                                <Globe className="absolute left-3 top-2.5 w-4 h-4 text-gray-900" />
                                                <input
                                                    type="text"
                                                    required
                                                    placeholder="e.g. docker.io"
                                                    value={url}
                                                    onChange={(e) => setUrl(e.target.value)}
                                                    className="w-full bg-gray-50 dark:bg-gray-900 border-[3px] border-slate-400 dark:border-gray-600 rounded-lg py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 transition-colors text-gray-900 dark:text-white"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-black dark:text-gray-400 mb-1">Username</label>
                                            <input
                                                type="text"
                                                required
                                                placeholder="Username"
                                                value={username}
                                                onChange={(e) => setUsername(e.target.value)}
                                                className="w-full bg-gray-50 dark:bg-gray-900 border-[3px] border-slate-400 dark:border-gray-600 rounded-lg py-2 px-4 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 transition-colors text-gray-900 dark:text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-black dark:text-gray-400 mb-1">Password / Token</label>
                                            <div className="flex gap-2">
                                                <input
                                                    type={showPassword ? "text" : "password"}
                                                    required
                                                    placeholder="• • • • • • • •"
                                                    value={password}
                                                    onChange={(e) => setPassword(e.target.value)}
                                                    className="w-full bg-gray-50 dark:bg-gray-900 border-[3px] border-slate-400 dark:border-gray-600 rounded-lg py-2 px-4 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 transition-colors text-gray-900 dark:text-white"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    className="px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-black dark:text-gray-200"
                                                >
                                                    {showPassword ? "Hide" : "Show"}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    {error && <p className="text-red-500 dark:text-red-400 text-sm">{error}</p>}
                                    <div className="flex justify-end gap-3">
                                        {editingId && (
                                            <button
                                                type="button"
                                                onClick={handleCancelEdit}
                                                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-black dark:text-white rounded-lg text-sm font-medium transition-colors"
                                            >
                                                Cancel
                                            </button>
                                        )}
                                        <button
                                            type="submit"
                                            disabled={loading}
                                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-500/20"
                                        >
                                            {loading ? (editingId ? 'Updating...' : 'Adding...') : (editingId ? 'Update Credential' : 'Save Credential')}
                                        </button>
                                    </div>
                                </form>
                            </div>

                            {/* Existing Registries Table */}
                            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-300 dark:border-gray-700 overflow-hidden shadow-sm">
                                <div className="px-6 py-4 border-b border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                                    <h3 className="font-semibold text-gray-900 dark:text-gray-200">Configured Registries</h3>
                                </div>
                                {registries.length === 0 ? (
                                    <div className="p-8 text-center text-gray-400 dark:text-gray-500">
                                        <Database className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                        <p>No registries configured yet.</p>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-sm">
                                            <thead>
                                                <tr className="bg-gray-100 dark:bg-gray-900/50 text-black dark:text-gray-400 border-b border-gray-300 dark:border-gray-700">
                                                    <th className="px-6 py-3 font-medium">URL</th>
                                                    <th className="px-6 py-3 font-medium">Username</th>
                                                    <th className="px-6 py-3 font-medium">Password</th>
                                                    <th className="px-6 py-3 font-medium text-right">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                {Array.isArray(registries) && registries.map((reg) => (
                                                    <tr key={reg.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group text-black dark:text-gray-200">
                                                        <td className="px-6 py-4 font-medium">{reg.url}</td>
                                                        <td className="px-6 py-4 text-black dark:text-gray-300">{reg.username}</td>
                                                        <td className="px-6 py-4 text-black dark:text-gray-500 font-mono text-xs">••••••••</td>
                                                        <td className="px-6 py-4 text-right">
                                                            <div className="flex items-center justify-end gap-2">
                                                                <button
                                                                    onClick={() => handleEditRegistry(reg)}
                                                                    className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-400/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                                                    title="Edit Registry"
                                                                >
                                                                    <Edit className="w-4 h-4" />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteRegistry(reg.id)}
                                                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-400/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                                                    title="Delete Registry"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

