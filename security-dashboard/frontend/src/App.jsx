import React, { useState, useRef, useEffect } from 'react';
import Login from './components/Login';
import ScanControl from './components/ScanControl';
import ReportViewer from './components/ReportViewer';
import WebTerminal from './components/WebTerminal';
import PolicyReports from './components/PolicyReports';
import ComplianceReport from './components/ComplianceReport';
import SelectReport from './components/SelectReport';
import Settings from './components/Settings';
import AuditLog from './components/AuditLog';
import DashboardCharts from './components/DashboardCharts';
import useFeatures from './useFeatures';
import { REPORT_TABS } from './components/reportParts';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCluster, apiUrl } from './cluster';
import { LayoutGrid, FileText, Terminal, FileCheck, SlidersHorizontal, ScrollText, Sun, Moon, LogOut, ChevronDown } from 'lucide-react';

// Path-based routing (react-router): each tab is a real URL, so refresh, back/forward and
// bookmarks work. The Scan reports tab also carries its view (/policy/image); Event logs is /events.
const TAB_PATHS = { dashboard: '/dashboard', policy: '/policy', reports: '/events', terminal: '/terminal', settings: '/settings', audit: '/audit' };
const TAB_IDS = Object.keys(TAB_PATHS);
const USER_TABS = ['dashboard', 'policy']; // what a non-superuser may open
const REPORT_VIEWS = REPORT_TABS.map(t => t.id);
const tabAllowed = (id, role, features = {}) => (role === 'superuser' ? TAB_IDS : USER_TABS).includes(id) && (id !== 'terminal' || !!features.terminal);
const defaultTab = () => 'dashboard'; // every role lands on Overview
const pathForTab = (tab, view) => (tab === 'policy' ? (view ? `/policy/${view}` : '/policy') : TAB_PATHS[tab]);
const parsePath = (pathname) => {
    const seg = pathname.replace(/^\/+/, '').split('/');
    const tab = TAB_IDS.find(k => TAB_PATHS[k] === '/' + (seg[0] || '')) || null;
    const view = (tab === 'policy' && REPORT_VIEWS.includes(seg[1])) ? seg[1] : null;
    return { tab, view };
};

function App() {
    const { cluster, setCluster, clusters, refresh: refreshClusters } = useCluster();
    const [user, setUser] = useState(() => {
        if (typeof window !== 'undefined' && window.localStorage) {
            // Drop an expired/unparseable session up front so we render Login directly
            // instead of flashing the dashboard until its first API call 401s.
            try {
                const saved = JSON.parse(localStorage.getItem('user') || 'null');
                const exp = JSON.parse(atob(saved.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp;
                if (exp * 1000 > Date.now()) return saved;
            } catch { }
            localStorage.removeItem('user');
        }
        return null;
    });

    const features = useFeatures(user);
    const navigate = useNavigate();
    const location = useLocation();
    const { tab: parsedTab, view: parsedView } = parsePath(location.pathname);
    const activeTab = (parsedTab && user && tabAllowed(parsedTab, user.role, features)) ? parsedTab : defaultTab(user?.role);
    const reportView = parsedView; // null on /policy: no report type is preselected
    const [logs, setLogs] = useState([]);

    // Sidebar width, dragged via the separator; remembered per browser.
    const clampRail = (w) => Math.min(480, Math.max(200, w));
    const [railW, setRailW] = useState(() => {
        try { return clampRail(Number(localStorage.getItem('railWidth')) || 264); } catch { return 264; }
    });
    useEffect(() => { try { localStorage.setItem('railWidth', String(railW)); } catch { } }, [railW]);
    const startRailDrag = (e) => {
        e.preventDefault();
        const x0 = e.clientX, w0 = railW;
        const move = (ev) => setRailW(clampRail(w0 + ev.clientX - x0));
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.style.cursor = ''; document.body.style.userSelect = ''; };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    };
    const [isScanning, setIsScanning] = useState(false);
    const [activeScanType, setActiveScanType] = useState(null);
    // Scan started from this browser; its live output is shown in Event logs
    const [liveScan, setLiveScan] = useState(null); // { scanId, type, startedAt, endedAt }
    const [statsVersion, setStatsVersion] = useState(0); // bumps when a scan ends so Overview reloads
    // Scans running on the server, started from any browser (GET /api/scans/active)
    const [serverRuns, setServerRuns] = useState([]);
    const [settingsSection, setSettingsSection] = useState(null);
    const [theme, setTheme] = useState(() => {
        if (typeof window !== 'undefined' && window.localStorage) {
            return localStorage.getItem('theme') || 'dark';
        }
        return 'dark';
    });
    const wsRef = useRef(null);

    // Nav counts and API status; refreshed on login and whenever a scan finishes.
    const [navRuns, setNavRuns] = useState(null);
    const [reportsOpen, setReportsOpen] = useState(true); // Scan reports sub-menu slid out
    const [apiUp, setApiUp] = useState(null);
    useEffect(() => {
        if (!user || isScanning) return;
        fetch(apiUrl(cluster, '/api/reports/')).then(r => (r.ok ? r.json() : null)).catch(() => null)
            .then(reps => setNavRuns(Array.isArray(reps) ? reps.length : null));
    }, [user, isScanning, cluster]);
    useEffect(() => { if (user) refreshClusters(); }, [user]);
    useEffect(() => {
        if (!user) return;
        const ping = () => fetch('/api/suppressions/', { cache: 'no-store' }).then(r => setApiUp(r.ok)).catch(() => setApiUp(false));
        ping();
        const id = setInterval(ping, 30000);
        return () => clearInterval(id);
    }, [user]);

    useEffect(() => {
        if (!user) return;
        let last = 0;
        const poll = () => fetch('/api/scans/active', { cache: 'no-store' })
            .then(r => (r.ok ? r.json() : []))
            .then(list => {
                const runs = Array.isArray(list) ? list : [];
                if (runs.length < last) setStatsVersion(v => v + 1); // a scan finished somewhere: reload Overview
                last = runs.length;
                setServerRuns(runs);
            })
            .catch(() => { });
        poll();
        const id = setInterval(poll, 5000);
        return () => clearInterval(id);
    }, [user, isScanning]);

    useEffect(() => {
        const root = window.document.documentElement;
        if (theme === 'dark') {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
        localStorage.setItem('theme', theme);
    }, [theme]);

    // Canonicalize the URL: a logged-in user on an unknown/disallowed path, bare "/", or
    // "/policy" without a view is redirected to the valid path (which also puts the view in the URL).
    useEffect(() => {
        if (!user) return;
        const want = pathForTab(activeTab, reportView);
        if (location.pathname !== want) navigate(want, { replace: true });
    }, [user, location.pathname, activeTab, reportView]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    };

    const handleLogin = (userData) => {
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
        navigate(pathForTab(defaultTab(userData.role)), { replace: true });
    };

    const handleLogout = () => {
        setUser(null);
        localStorage.removeItem('user');
        navigate('/', { replace: true });
    };



    const SCAN_LABELS = {
        'trivy-image': 'Image Scan',
        'trivy-sbom': 'SBOM Scan',
        'trivy-repo': 'Repo Scan',
        'nmap': 'Network Scan',
        'kyverno': 'Policy Scan',
        'kube-bench': 'CIS Benchmarks',
        'trivy-cluster': 'Cluster Scan',
        'trivy-compliance': 'Compliance Scan',
        'all': 'Full scan',
    };

    // Safe ID generator that works in all contexts (http/https/older browsers)
    const generateScanId = () => {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return 'scan-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11);
    };

    const startScan = async (type) => {
        setIsScanning(true);
        setActiveScanType(type);
        setLogs([]);

        // Generate ID client-side to coordinate WS connection before trigger
        const scanId = generateScanId();
        setLiveScan({ scanId, type, startedAt: Date.now(), endedAt: null });

        try {
            setLogs(prev => [...prev, "Initializing connection..."]);
            await connectWebSocket(scanId);

            setLogs(prev => [...prev, "Starting scan process..."]);
            const response = await fetch('/api/scans/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    scan_type: type,
                    cluster,
                    scan_id: scanId
                }),
            });

            if (!response.ok) {
                throw new Error(`Failed to start scan: ${response.statusText}`);
            }

        } catch (error) {
            setLogs(prev => [...prev, `Error: ${error.message}`]);
            setIsScanning(false);
            setActiveScanType(null);
            setLiveScan(l => l && { ...l, endedAt: Date.now() });
            if (wsRef.current) wsRef.current.close();
        }
    };

    const connectWebSocket = (scanId) => {
        return new Promise((resolve, reject) => {
            // Close existing if open
            if (wsRef.current) {
                wsRef.current.close();
            }

            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const token = JSON.parse(localStorage.getItem('user') || 'null')?.token;
            const wsUrl = `${protocol}//${window.location.host}/api/scans/ws/${scanId}?token=${encodeURIComponent(token)}`;
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            // Connection timeout safety
            const timeoutId = setTimeout(() => {
                if (ws.readyState !== WebSocket.OPEN) {
                    ws.close();
                    reject(new Error("Connection timed out (5s). Check network/backend."));
                }
            }, 5000);

            ws.onopen = () => {
                clearTimeout(timeoutId);
                setLogs(prev => [...prev, "--- Connection Established ---"]);
                resolve(ws);
            };

            ws.onmessage = (event) => {
                const message = event.data;
                if (message === "__EOF__") {
                    setLogs(prev => [...prev, "--- Scan Session Ended ---"]);
                    ws.close();
                    setIsScanning(false);
                    setActiveScanType(null);
                    setLiveScan(l => l && { ...l, endedAt: Date.now() });
                    setStatsVersion(v => v + 1);
                } else {
                    // Handle messages that may contain newlines or partial lines
                    // Remove only the trailing newline, preserve internal structure
                    const cleanMessage = message.replace(/\n$/, '');

                    // Skip empty messages
                    if (!cleanMessage.trim()) return;

                    // Split on newlines to handle multi-line messages properly
                    const lines = cleanMessage.split('\n');

                    setLogs(prev => {
                        const newLogs = [...prev];
                        lines.forEach(line => {
                            if (line.trim()) {
                                newLogs.push(line);
                            }
                        });
                        return newLogs;
                    });
                }
            };

            ws.onerror = () => {
                if (ws.readyState === WebSocket.CONNECTING) {
                    clearTimeout(timeoutId);
                    reject(new Error("WebSocket connection failed"));
                } else {
                    setLogs(prev => [...prev, "--- Connection Error ---"]);
                }
            };
        });
    };

    useEffect(() => {
        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, []);

    if (!user) {
        return <Login onLogin={handleLogin} />;
    }

    const goOverview = () => navigate('/dashboard');
    const runningCount = Math.max(serverRuns.length, isScanning ? 1 : 0);
    const anyRunning = runningCount > 0;
    const remoteRun = !isScanning && serverRuns[0];

    const NAV = [
        { id: 'dashboard', label: 'Overview', Icon: LayoutGrid, onClick: goOverview },
        { id: 'policy', label: 'Scan reports', Icon: FileCheck, onClick: () => { if (activeTab === 'policy') setReportsOpen(o => !o); else { navigate(pathForTab('policy', reportView)); setReportsOpen(true); } }, },
        { id: 'reports', label: 'Event logs', Icon: FileText, superOnly: true, count: anyRunning ? `${runningCount} running` : navRuns || null, countRun: anyRunning },
        { id: 'terminal', label: 'Terminal', Icon: Terminal, superOnly: true },
        { id: 'settings', label: 'Settings', Icon: SlidersHorizontal, superOnly: true },
        { id: 'audit', label: 'Audit log', Icon: ScrollText, superOnly: true },
    ].filter(n => (user.role === 'superuser' || !n.superOnly) && (n.id !== 'terminal' || features.terminal));

    return (
        <div className="h-screen overflow-hidden flex flex-col" style={{ background: 'var(--page)', color: 'var(--ink)' }}>
            <header className="h-16 shrink-0 flex items-center gap-5 px-4" style={{ background: 'var(--header)', color: 'var(--header-ink)', borderBottom: '1px solid var(--header-line)' }}>
                <button type="button" onClick={goOverview} className="flex items-center gap-2.5 bg-transparent border-0 p-0 cursor-pointer" style={{ color: 'inherit' }}>
                    <svg width="26" height="26" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.5 17 4v5.5c0 4.2-2.9 7.4-7 9-4.1-1.6-7-4.8-7-9V4l7-2.5Z" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M10 5v10M6 8.5h8" stroke="#7FA3D6" strokeWidth="1.4" /></svg>
                    <span className="text-[17px] font-semibold tracking-[.06em]">DEVSECOPS</span>
                    <span className="text-[17px]" style={{ color: 'var(--header-mute)' }}>Security Console</span>
                </button>

                {apiUp === false && (
                    <>
                        <div className="w-px h-[18px]" style={{ background: 'var(--header-line)' }} />
                        <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--header-mute)' }} role="status">
                            <span className="w-1.5 h-1.5" style={{ background: '#E58C8C' }} />
                            API unreachable
                        </span>
                    </>
                )}

                {remoteRun && (
                    <>
                        <div className="w-px h-[18px]" style={{ background: 'var(--header-line)' }} />
                        <button type="button" onClick={() => navigate('/events')} title="Show progress in Event logs"
                            className="flex items-center gap-2 text-xs bg-transparent border-0 p-0 cursor-pointer underline-offset-2 hover:underline" style={{ color: 'var(--header-ink)' }}>
                            <span className="w-1.5 h-1.5 animate-pulse" style={{ background: '#7FA3D6' }} />
                            {SCAN_LABELS[remoteRun.scan_type] ?? remoteRun.scan_type} running{serverRuns.length > 1 ? ` (+${serverRuns.length - 1})` : ''}… <span style={{ color: 'var(--header-mute)' }}>View progress</span>
                        </button>
                    </>
                )}

                {isScanning && activeScanType && (
                    <>
                        <div className="w-px h-[18px]" style={{ background: 'var(--header-line)' }} />
                        <button type="button" onClick={() => navigate('/events')} title="Show progress in Event logs"
                            className="flex items-center gap-2 text-xs bg-transparent border-0 p-0 cursor-pointer underline-offset-2 hover:underline" style={{ color: 'var(--header-ink)' }}>
                            <span className="w-1.5 h-1.5 animate-pulse" style={{ background: '#7FA3D6' }} />
                            {SCAN_LABELS[activeScanType] ?? activeScanType} running… <span style={{ color: 'var(--header-mute)' }}>View progress</span>
                        </button>
                    </>
                )}

                <div className="flex-1" />

                {clusters.length > 1 && (
                    <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--header-mute)' }}>
                        Cluster
                        <select
                            className="h-[26px] px-1.5 text-xs"
                            style={{ background: 'transparent', color: 'var(--header-ink)', border: '1px solid var(--header-line)' }}
                            value={cluster}
                            onChange={(e) => setCluster(e.target.value)}
                            aria-label="Cluster"
                        >
                            {clusters.map(c => <option key={c.name} value={c.name} style={{ color: '#000' }}>{c.name}</option>)}
                        </select>
                    </label>
                )}

                <button
                    type="button"
                    onClick={toggleTheme}
                    className="btn h-[26px]"
                    style={{ background: 'transparent', color: 'var(--header-ink)', borderColor: 'var(--header-line)' }}
                    title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                    {theme === 'dark' ? <Sun className="w-3.5 h-3.5" strokeWidth={1.5} /> : <Moon className="w-3.5 h-3.5" strokeWidth={1.5} />}
                    {theme === 'dark' ? 'Light' : 'Dark'}
                </button>
                <span className="text-xs" style={{ color: 'var(--header-mute)' }}>{user?.username || 'User'} · {user.role}</span>
                <button
                    type="button"
                    onClick={handleLogout}
                    className="btn h-[26px]"
                    style={{ background: 'transparent', color: 'var(--header-ink)', borderColor: 'var(--header-line)' }}
                    title="Logout"
                >
                    <LogOut className="w-3.5 h-3.5" strokeWidth={1.5} />
                    Sign out
                </button>
            </header>

            <div className="flex-1 flex min-h-0">
                <aside style={{ width: railW }} className="rail shrink-0 flex flex-col pt-3 pb-3 overflow-y-auto relative z-30" aria-label="Primary">
                    <nav>
                        {NAV.map(({ id, label, Icon, onClick, count, countRun }) => (
                            <React.Fragment key={id}>
                                <button
                                    type="button"
                                    onClick={onClick || (() => navigate(TAB_PATHS[id]))}
                                    className={`navlink ${activeTab === id ? 'on' : ''}`}
                                    aria-current={activeTab === id ? 'page' : undefined}
                                    aria-expanded={id === 'policy' ? activeTab === 'policy' && reportsOpen : undefined}
                                >
                                    <Icon className="w-4 h-4" strokeWidth={1.5} />
                                    {label}
                                    {count != null && (
                                        <span className="num ml-auto text-[12px]" style={{ color: activeTab === id ? '#D6E1F0' : countRun ? 'var(--accent-text)' : 'var(--mute-2)' }}>{count}</span>
                                    )}
                                    {id === 'policy' && (
                                        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${count != null ? 'ml-1' : 'ml-auto'}`} strokeWidth={1.8}
                                            style={{ transform: activeTab === 'policy' && reportsOpen ? 'rotate(180deg)' : 'none' }} aria-hidden="true" />
                                    )}
                                </button>
                                {id === 'policy' && (
                                    <div className={`subnav ${activeTab === 'policy' && reportsOpen ? 'open' : ''}`}>
                                        <div className="subnav-inner" aria-label="Report type">
                                            {REPORT_TABS.map(t => {
                                                const on = activeTab === 'policy' && reportView === t.id;
                                                return (
                                                    <button
                                                        key={t.id}
                                                        type="button"
                                                        tabIndex={activeTab === 'policy' && reportsOpen ? 0 : -1}
                                                        className={`subnav-item ${on ? 'on' : ''}`}
                                                        aria-current={on ? 'page' : undefined}
                                                        onClick={() => navigate(`/policy/${t.id}`)}
                                                    >
                                                        <span className="truncate">{t.label}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </React.Fragment>
                        ))}
                    </nav>

                    {user.role === 'superuser' && (
                        <ScanControl
                            activeTab={activeTab}
                            onStartScan={startScan}
                            isScanning={anyRunning}
                            runningTypes={new Set([...serverRuns.map(r => r.scan_type), isScanning && activeScanType])}
                            onNavigateToSettings={(section) => {
                                setSettingsSection(section);
                                navigate('/settings');
                            }}
                        />
                    )}


                </aside>
                <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize sidebar"
                    aria-valuenow={railW}
                    aria-valuemin={200}
                    aria-valuemax={480}
                    tabIndex={0}
                    className="rail-resizer"
                    onPointerDown={startRailDrag}
                    onDoubleClick={() => setRailW(264)}
                    onKeyDown={(e) => {
                        if (e.key === 'ArrowLeft') { e.preventDefault(); setRailW(w => clampRail(w - 16)); }
                        if (e.key === 'ArrowRight') { e.preventDefault(); setRailW(w => clampRail(w + 16)); }
                    }}
                    title="Drag to resize · double-click to reset"
                />

                <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
                    {activeTab === 'dashboard' ? (
                        <div className="flex-1 min-h-0 overflow-auto px-7 pt-[18px] pb-6">
                            <DashboardCharts key={`${statsVersion}-${cluster}`} />
                        </div>
                    ) : activeTab === 'reports' ? (
                        <ReportViewer
                            key={cluster}
                            live={liveScan && { ...liveScan, label: SCAN_LABELS[liveScan.type] ?? liveScan.type, logs, isScanning }}
                            active={serverRuns}
                            labelFor={(t) => SCAN_LABELS[t] ?? t}
                        />
                    ) : activeTab === 'policy' ? (
                        !reportView ? <SelectReport /> : reportView === 'compliance' ? <ComplianceReport key={cluster} /> : <PolicyReports key={cluster} activeView={reportView} />
                    ) : activeTab === 'settings' ? (
                        <Settings initialSection={settingsSection} />
                    ) : activeTab === 'audit' ? (
                        <AuditLog />
                    ) : activeTab === 'terminal' ? (
                        <WebTerminal />
                    ) : null}
                </main>
            </div>
        </div>
    );
}

export default App;
