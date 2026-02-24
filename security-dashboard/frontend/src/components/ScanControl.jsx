import React, { useState, useEffect } from 'react';
import { Play, Shield, Activity, Layers, Terminal, GitGraph, AlertCircle, X } from 'lucide-react';
import ScanConfirmationPanel from './ScanConfirmationPanel';

const SCAN_TYPES = [
    { id: 'trivy-image', label: 'Image Vulnerabilities', icon: <Layers className="w-4 h-4" /> },
    { id: 'trivy-sbom', label: 'SBOM Inventory', icon: <Layers className="w-4 h-4" /> },
    { id: 'trivy-repo', label: 'Source Code Scan', icon: <GitGraph className="w-4 h-4" /> },
    { id: 'nmap', label: 'Network Security Scan', icon: <Terminal className="w-4 h-4" /> },
    { id: 'kyverno', label: 'Policy Compliance', icon: <Activity className="w-4 h-4" /> },
    { id: 'kube-bench', label: 'CIS Benchmarks', icon: <Shield className="w-4 h-4" /> },
    { id: 'trivy-cluster', label: 'Cluster Risks Scan', icon: <Layers className="w-4 h-4" /> },
];

export default function ScanControl({ onStartScan, isScanning, onNavigateToSettings }) {
    const [showPanel, setShowPanel] = useState(false);
    const [selectedScan, setSelectedScan] = useState(null);
    const [gitConfigReady, setGitConfigReady] = useState(null); // null=loading, true/false
    const [registryConfigReady, setRegistryConfigReady] = useState(null); // null=loading, true/false
    const [prereqWarning, setPrereqWarning] = useState(null); // null | 'git' | 'registry'
    const [gitRepos, setGitRepos] = useState([]);
    const [showRepos, setShowRepos] = useState(false);

    useEffect(() => {
        checkGitConfig();
        checkRegistryConfig();
    }, []);

    const checkGitConfig = async () => {
        try {
            const response = await fetch('/api/settings/git-config');
            if (!response.ok) { setGitConfigReady(false); return; }
            const data = await response.json();
            const repos = data.repos
                ? data.repos.split('\n').filter(r => r.trim() && !r.trim().startsWith('#'))
                : [];
            setGitRepos(repos);
            setGitConfigReady(!!(data.username && repos.length > 0));
        } catch {
            setGitConfigReady(false);
        }
    };

    const checkRegistryConfig = async () => {
        try {
            const response = await fetch('/api/settings/registries');
            if (!response.ok) { setRegistryConfigReady(false); return; }
            const data = await response.json();
            setRegistryConfigReady(Array.isArray(data) && data.length > 0);
        } catch {
            setRegistryConfigReady(false);
        }
    };

    const handleStartScan = (scanType) => {
        if (scanType.id === 'trivy-repo' && !gitConfigReady) {
            setPrereqWarning('git');
            return;
        }
        if (scanType.id === 'trivy-image' && !registryConfigReady) {
            setPrereqWarning('registry');
            return;
        }
        setSelectedScan(scanType);
        setShowPanel(true);
    };

    const confirmScan = () => {
        if (selectedScan) {
            onStartScan(selectedScan.id);
            setShowPanel(false);
            setSelectedScan(null);
        }
    };

    const cancelScan = () => {
        setShowPanel(false);
        setSelectedScan(null);
    };

    return (
        <div className="h-full flex flex-col relative z-0">
            <div className="flex-col flex h-full relative z-20 bg-white dark:bg-gray-800">
                <div className="p-6 border-b border-slate-200 dark:border-gray-700">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <div className="p-2 bg-gradient-blue rounded-lg">
                            <Activity className="w-5 h-5 text-azure-600" />
                        </div>
                        Security Operations
                    </h2>
                </div>

                {/* Prerequisite warning */}
                {prereqWarning && (
                    <div className="mx-4 mt-3 flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/30 rounded-lg p-3">
                        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                            {prereqWarning === 'git' ? (
                                <>
                                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Git Config Required</p>
                                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                                        Go to{' '}
                                        <button
                                            type="button"
                                            onClick={() => { setPrereqWarning(null); onNavigateToSettings?.('git'); }}
                                            className="font-semibold underline hover:text-amber-900 dark:hover:text-amber-200"
                                        >
                                            Settings → Git Configuration
                                        </button>
                                        {' '}to add your credentials and Repo list before running a source code scan.
                                    </p>
                                </>
                            ) : (
                                <>
                                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Registry Config Required</p>
                                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                                        Go to{' '}
                                        <button
                                            type="button"
                                            onClick={() => { setPrereqWarning(null); onNavigateToSettings?.('registry'); }}
                                            className="font-semibold underline hover:text-amber-900 dark:hover:text-amber-200"
                                        >
                                            Settings → Registry Management
                                        </button>
                                        {' '}to add your credentials before running an image vulnerability scan.
                                    </p>
                                </>
                            )}
                        </div>
                        <button
                            onClick={() => setPrereqWarning(null)}
                            className="text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 flex-shrink-0"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}

                <div className="flex-1 flex flex-col overflow-y-auto">
                    {SCAN_TYPES.map((type) => {
                        const isMissingConfig = (type.id === 'trivy-repo' && gitConfigReady === false)
                            || (type.id === 'trivy-image' && registryConfigReady === false);

                        return (
                            <React.Fragment key={type.id}>
                                <button
                                    onClick={() => handleStartScan(type)}
                                    disabled={isScanning}
                                    className={`flex items-center gap-3 py-3 px-6 border-b border-slate-200 dark:border-gray-700 transition-all duration-200 w-full font-medium text-sm transform ${isScanning
                                        ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-gray-800 text-slate-500 dark:text-gray-400'
                                        : isMissingConfig
                                            ? 'bg-amber-50 dark:bg-amber-900/10 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/20 hover:border-l-4 hover:border-l-amber-500 hover:shadow-lg hover:shadow-amber-500/20 hover:scale-[1.01] hover:-translate-x-1'
                                            : 'bg-white dark:bg-gray-800 hover:bg-azure-50 dark:hover:bg-azure-600/10 text-slate-900 dark:text-gray-200 hover:text-azure-800 dark:hover:text-azure-100 hover:border-l-4 hover:border-l-azure-500 hover:shadow-lg hover:shadow-azure-500/20 hover:scale-[1.01] hover:-translate-x-1'
                                        }`}
                                >
                                    <div className={`p-2 rounded-lg transition-all duration-200 ${isMissingConfig ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : 'bg-slate-100 dark:bg-gray-700 text-azure-700 dark:text-azure-400'}`}>
                                        {React.cloneElement(type.icon, { className: "w-4 h-4" })}
                                    </div>
                                    <span>{type.label}</span>
                                </button>
                                {type.id === 'trivy-repo' && gitConfigReady === true && gitRepos.length > 0 && (
                                    <div className="border-b border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900/40">
                                        <button
                                            type="button"
                                            onClick={() => setShowRepos(v => !v)}
                                            className="w-full flex items-center justify-between px-6 py-1.5 text-xs text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200 transition-colors"
                                        >
                                            <span>{gitRepos.length} repo{gitRepos.length !== 1 ? 's' : ''} configured</span>
                                            <span className="text-slate-400">{showRepos ? '▲' : '▼'}</span>
                                        </button>
                                        {showRepos && (
                                            <ul className="px-6 pb-2 space-y-1">
                                                {gitRepos.map((repo, i) => (
                                                    <li key={i} className="text-xs text-slate-600 dark:text-gray-400 font-mono truncate" title={repo}>
                                                        {repo}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>

                <div className="p-4 bg-slate-50 dark:bg-gray-900/50 border-t border-slate-200 dark:border-gray-700 mt-auto">
                    <button
                        onClick={() => { }}
                        disabled={true}
                        className="w-full py-3 px-4 text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-all bg-slate-200 dark:bg-gray-700/50 border border-slate-300 dark:border-gray-600 opacity-50 cursor-not-allowed text-slate-400 dark:text-gray-500"
                        title="Run All Scans (Disabled)"
                    >
                        <Play className="w-4 h-4 fill-current" />
                        Run All Scans
                    </button>
                </div>
            </div>

            <ScanConfirmationPanel
                isOpen={showPanel}
                onClose={cancelScan}
                onConfirm={confirmScan}
                scanLabel={selectedScan?.label}
            />
        </div>
    );
}
