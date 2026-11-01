import React, { useState, useEffect } from 'react';
import { AlertTriangle, X, ChevronDown, Radar } from 'lucide-react';
import ScanConfirmationPanel from './ScanConfirmationPanel';
import { useCluster, apiUrl } from '../cluster';

export const SCAN_TYPES = [
    { id: 'trivy-image', label: 'Image vulnerabilities', tool: 'trivy image', group: 'Workloads', script: '2_run_trivy_image.sh', about: 'Scans the container images running in the cluster for known CVEs.' },
    { id: 'trivy-sbom', label: 'SBOM inventory', tool: 'trivy sbom', group: 'Workloads', script: '1_run_trivy_sbom.sh', about: 'Builds a software bill of materials for each image and checks it for vulnerabilities.' },
    { id: 'kyverno', label: 'Policy compliance', tool: 'kyverno', group: 'Cluster', script: '6_run_kyverno.sh', about: 'Collects Kyverno policy reports for every namespace.' },
    { id: 'nmap', label: 'Network exposure', tool: 'nmap', group: 'Network', script: '3_run_nmap.sh', about: 'Probes cluster services for open ports and weak TLS ciphers.' },
    { id: 'trivy-repo', label: 'Source code', tool: 'trivy repo', group: 'Source', script: '7_run_trivy_repo.sh', about: 'Clones the configured Git repositories and scans them for vulnerabilities and secrets.' },
    { id: 'kube-bench', label: 'CIS benchmark', tool: 'kube-bench', group: 'Cluster', script: '4_run_kube_bench.sh', about: 'Runs the CIS Kubernetes Benchmark checks against the cluster nodes.' },
    { id: 'trivy-cluster', label: 'Cluster risks', tool: 'trivy k8s', group: 'Cluster', script: '5_run_trivy_cluster.sh', about: 'Checks Kubernetes resources for misconfigurations, secrets and vulnerable workloads.' },
    { id: 'trivy-compliance', label: 'Compliance', tool: 'trivy k8s', group: 'Cluster', script: '8_run_trivy_compliance.sh', about: 'Checks workloads against the NSA hardening guidance and the Pod Security Standards.' },
];

// Scans that can run against a registered (non-local) cluster; the rest inspect the dashboard's own host/network or are cluster independent.
const REMOTE_SCANS = ['trivy-image', 'trivy-sbom', 'kyverno', 'trivy-cluster'];

const PlayIcon = () => (
    <svg width="8" height="8" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 1l6 4-6 4z" fill="currentColor" /></svg>
);

export default function ScanControl({ activeTab, onStartScan, isScanning, runningTypes = new Set(), onNavigateToSettings }) {
    const { cluster } = useCluster();
    const remote = cluster !== 'local';
    const [showPanel, setShowPanel] = useState(false);
    const [selectedScan, setSelectedScan] = useState(null);
    const [gitConfigReady, setGitConfigReady] = useState(null); // null=loading, true/false
    const [registryConfigReady, setRegistryConfigReady] = useState(null); // null=loading, true/false
    const [registryCount, setRegistryCount] = useState(0);
    const [prereqWarning, setPrereqWarning] = useState(null); // null | 'git' | 'registry'
    const [open, setOpen] = useState(true); // scan list slides out from the Start scanning button

    const [lastRuns, setLastRuns] = useState({}); // scan_type -> latest report
    const [fullScan, setFullScan] = useState(SCAN_TYPES.map(t => t.id)); // scans a full ("all") run includes; Settings → Full scan

    // The sidebar stays mounted across tabs, so its transient scan UI (confirm panel,
    // prereq warning) would otherwise linger when the user navigates away. Clear it on tab change.
    useEffect(() => {
        setShowPanel(false);
        setSelectedScan(null);
        setPrereqWarning(null);
    }, [activeTab]);

    useEffect(() => {
        checkGitConfig();
        checkRegistryConfig();
        fetch(apiUrl(cluster, '/api/reports/'))
            .then(r => (r.ok ? r.json() : []))
            .then(list => {
                const latest = {};
                (Array.isArray(list) ? list : []).forEach(r => {
                    if (!latest[r.scan_type] || new Date(r.timestamp) > new Date(latest[r.scan_type].timestamp)) latest[r.scan_type] = r;
                });
                setLastRuns(latest);
            })
            .catch(() => { });
    }, [isScanning, cluster]);

    // Settings fires this after a git/registry save so "Set up" clears without a reload.
    useEffect(() => {
        const recheck = () => { checkGitConfig(); checkRegistryConfig(); checkFullScan(); };
        checkFullScan();
        window.addEventListener('scan-settings-changed', recheck);
        return () => window.removeEventListener('scan-settings-changed', recheck);
    }, []);

    const checkGitConfig = async () => {
        try {
            const response = await fetch('/api/settings/git-config');
            if (!response.ok) { setGitConfigReady(false); return; }
            const data = await response.json();
            const repos = data.repos
                ? data.repos.split('\n').filter(r => r.trim() && !r.trim().startsWith('#'))
                : [];
            setGitConfigReady(!!(data.username && repos.length > 0));
        } catch {
            setGitConfigReady(false);
        }
    };

    const checkFullScan = () => {
        fetch('/api/settings/full-scan').then(r => (r.ok ? r.json() : null)).then(d => d && setFullScan(d.scans)).catch(() => { });
    };

    const checkRegistryConfig = async () => {
        try {
            const response = await fetch('/api/settings/registries');
            if (!response.ok) { setRegistryConfigReady(false); return; }
            const data = await response.json();
            const ok = Array.isArray(data) && data.length > 0;
            setRegistryConfigReady(ok);
            setRegistryCount(ok ? data.length : 0);
        } catch {
            setRegistryConfigReady(false);
        }
    };

    const handleStartScan = (scanType) => {
        if (scanType.id === 'all') {
            setSelectedScan({
                id: 'all',
                label: 'Full scan',
                about: 'Runs the selected scans one after another.',
                includes: SCAN_TYPES.filter(t => fullScan.includes(t.id) && (!remote || REMOTE_SCANS.includes(t.id))),
            });
            setShowPanel(true);
            return;
        }
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

    const anyRunning = [...runningTypes].some(Boolean); // App adds `false` when no local scan is active
    const goSettings = (section) => { setPrereqWarning(null); onNavigateToSettings?.(section); };

    return (
        <>
            <button
                type="button"
                className={`navlink mt-3 ${open ? 'expanded' : ''}`}
                aria-expanded={open}
                aria-controls="scan-list"
                onClick={() => setOpen(v => !v)}
            >
                <Radar className="w-4 h-4" strokeWidth={1.5} />
                Start scanning
                <ChevronDown className="w-3.5 h-3.5 ml-auto transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
            </button>
            <div id="scan-list" className={`subnav ${open ? 'open' : ''}`}>
                <div className="subnav-inner flat">

            {prereqWarning && (
                <div className="note note-warn mx-3 mt-2" role="alert">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={1.8} />
                    <div className="flex-1 min-w-0">
                        <div className="font-semibold">{prereqWarning === 'git' ? 'Git configuration required' : 'Registry credentials required'}</div>
                        <div className="mt-0.5">
                            Add them in{' '}
                            <button type="button" className="underline font-semibold bg-transparent border-0 p-0 cursor-pointer" style={{ color: 'inherit' }}
                                onClick={() => goSettings(prereqWarning === 'git' ? 'git' : 'registry')}>
                                {prereqWarning === 'git' ? 'Settings → Git repositories' : 'Settings → Container registries'}
                            </button>
                            {prereqWarning === 'git' ? ' before running a source code scan.' : ' before running an image scan.'}
                        </div>
                    </div>
                    <button type="button" onClick={() => setPrereqWarning(null)} aria-label="Dismiss" className="bg-transparent border-0 p-0 cursor-pointer self-start" style={{ color: 'inherit' }}>
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {SCAN_TYPES.map(type => {
                const localOnly = remote && !REMOTE_SCANS.includes(type.id);
                const isMissingConfig = (type.id === 'trivy-repo' && gitConfigReady === false)
                    || (type.id === 'trivy-image' && registryConfigReady === false);
                const picked = showPanel && selectedScan?.id === type.id;
                // Different scans can run in parallel; the same scan can't (its script writes to a fixed output path).
                // An "all" run (Run all scans or the scheduled CronJob) runs the scans picked in Settings → Full scan;
                // source code only when Git settings are complete.
                const running = runningTypes.has(type.id) || (runningTypes.has('all') && fullScan.includes(type.id) && (type.id !== 'trivy-repo' || gitConfigReady));
                // Trivy scans share one cache/DB and block each other, so only one runs at a time.
                const trivyBusy = !running && type.id.startsWith('trivy-') && [...runningTypes].some(t => t === 'all' || (typeof t === 'string' && t.startsWith('trivy-')));
                return (
                    <button
                        key={type.id}
                        type="button"
                        onClick={() => handleStartScan(type)}
                        disabled={running || trivyBusy || localOnly}
                        tabIndex={open ? 0 : -1}
                        className={`scanrow ${isMissingConfig ? 'unset' : ''} ${picked ? 'picked' : ''}`}
                        aria-expanded={picked}
                    >
                        <span className="sl"><span className="sn">{type.label}</span></span>
                        {localOnly
                            ? <span className="go" title="This scan only runs against the local cluster">Local only</span>
                            : running
                            ? <span className="go">Running…</span>
                            : trivyBusy
                            ? <span className="go" title="Another Trivy scan is running">Trivy busy</span>
                            : isMissingConfig
                            ? <span className="go setup">Set up</span>
                            : <span className="go"><PlayIcon />Run</span>}
                    </button>
                );
            })}

            <div className="mx-3 mt-4">
                {/* Blocked while anything runs: a full scan reuses every scan's fixed output path and the shared Trivy cache. */}
                <button type="button" className="btn w-full" onClick={() => handleStartScan({ id: 'all' })} tabIndex={open ? 0 : -1}
                    disabled={anyRunning || !fullScan.length}
                    title={anyRunning ? 'Wait for running scans to finish' : remote ? `Runs the scans supported on ${cluster}` : `Runs ${fullScan.length} of ${SCAN_TYPES.length} scans`}>
                    {runningTypes.has('all') ? 'Full scan running…' : <><PlayIcon /> Run all scans <span className="num text-[11px]" style={{ color: 'var(--mute-2)' }}>{fullScan.length}/{SCAN_TYPES.length}</span></>}
                </button>
            </div>

                </div>
            </div>

            <ScanConfirmationPanel
                isOpen={showPanel}
                onClose={cancelScan}
                onConfirm={confirmScan}
                scanLabel={selectedScan?.label}
                scan={selectedScan}
                cluster={cluster}
                lastRun={selectedScan ? lastRuns[selectedScan.id] : null}
                registryCount={registryCount}
                onEditIncludes={() => { cancelScan(); goSettings('fullscan'); }}
            />
        </>
    );
}
