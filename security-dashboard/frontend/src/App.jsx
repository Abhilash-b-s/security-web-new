import React, { useState, useRef, useEffect } from 'react';
import Login from './components/Login';
import ScanControl from './components/ScanControl';
import ReportViewer from './components/ReportViewer';
import WebTerminal from './components/WebTerminal';
import PolicyReports from './components/PolicyReports';
import Settings from './components/Settings';
import DashboardCharts from './components/DashboardCharts';
import { REPORT_TABS } from './components/reportParts';
import { LayoutGrid, FileText, Terminal, FileCheck, SlidersHorizontal, Sun, Moon, LogOut, ChevronDown } from 'lucide-react';

function App() {
    const [user, setUser] = useState(() => {
        if (typeof window !== 'undefined' && window.localStorage) {
            const saved = localStorage.getItem('user');
            return saved ? JSON.parse(saved) : null;
        }
        return null;
    });

    const [activeTab, setActiveTab] = useState(() => {
        if (user && user.role === 'user') {
            return 'policy';
        }
        return 'dashboard';
    });
    const [logs, setLogs] = useState([]);
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
    const [reportView, setReportView] = useState('kyverno'); // which Scan reports page is open
    const [reportsOpen, setReportsOpen] = useState(true); // Scan reports sub-menu slid out
    const [apiUp, setApiUp] = useState(null);
    useEffect(() => {
        if (!user || isScanning) return;
        fetch('/api/reports/').then(r => (r.ok ? r.json() : null)).catch(() => null)
            .then(reps => setNavRuns(Array.isArray(reps) ? reps.length : null));
    }, [user, isScanning]);
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

    useEffect(() => {
        if (user && user.role === 'user' && activeTab !== 'policy') {
            setActiveTab('policy');
        }
    }, [user, activeTab]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    };

    const handleLogin = (userData) => {
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
        if (userData.role === 'user') {
            setActiveTab('policy');
        } else {
            setActiveTab('dashboard');
        }
    };

    const handleLogout = () => {
        setUser(null);
        localStorage.removeItem('user');
        setActiveTab('dashboard'); // Reset tab for next login
    };



    const SCAN_LABELS = {
        'trivy-image': 'Image Scan',
        'trivy-sbom': 'SBOM Scan',
        'trivy-repo': 'Repo Scan',
        'nmap': 'Network Scan',
        'kyverno': 'Policy Scan',
        'kube-bench': 'CIS Benchmarks',
        'trivy-cluster': 'Cluster Scan',
        'all': 'All scans',
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
            const wsUrl = `${protocol}//${window.location.host}/api/scans/ws/${scanId}`;
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

    const goOverview = () => setActiveTab('dashboard');
    const runningCount = Math.max(serverRuns.length, isScanning ? 1 : 0);
    const anyRunning = runningCount > 0;
    const remoteRun = !isScanning && serverRuns[0];

    const NAV = [
        { id: 'dashboard', label: 'Overview', Icon: LayoutGrid, superOnly: true, onClick: goOverview },
        { id: 'policy', label: 'Scan reports', Icon: FileCheck, onClick: () => { if (activeTab === 'policy') setReportsOpen(o => !o); else { setActiveTab('policy'); setReportsOpen(true); } }, },
        { id: 'reports', label: 'Event logs', Icon: FileText, superOnly: true, count: anyRunning ? `${runningCount} running` : navRuns || null, countRun: anyRunning },
        { id: 'terminal', label: 'Terminal', Icon: Terminal, superOnly: true },
        { id: 'settings', label: 'Settings', Icon: SlidersHorizontal, superOnly: true },
    ].filter(n => user.role === 'superuser' || !n.superOnly);

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
                        <button type="button" onClick={() => setActiveTab('reports')} title="Show progress in Event logs"
                            className="flex items-center gap-2 text-xs bg-transparent border-0 p-0 cursor-pointer underline-offset-2 hover:underline" style={{ color: 'var(--header-ink)' }}>
                            <span className="w-1.5 h-1.5 animate-pulse" style={{ background: '#7FA3D6' }} />
                            {SCAN_LABELS[remoteRun.scan_type] ?? remoteRun.scan_type} running{serverRuns.length > 1 ? ` (+${serverRuns.length - 1})` : ''}… <span style={{ color: 'var(--header-mute)' }}>View progress</span>
                        </button>
                    </>
                )}

                {isScanning && activeScanType && (
                    <>
                        <div className="w-px h-[18px]" style={{ background: 'var(--header-line)' }} />
                        <button type="button" onClick={() => setActiveTab('reports')} title="Show progress in Event logs"
                            className="flex items-center gap-2 text-xs bg-transparent border-0 p-0 cursor-pointer underline-offset-2 hover:underline" style={{ color: 'var(--header-ink)' }}>
                            <span className="w-1.5 h-1.5 animate-pulse" style={{ background: '#7FA3D6' }} />
                            {SCAN_LABELS[activeScanType] ?? activeScanType} running… <span style={{ color: 'var(--header-mute)' }}>View progress</span>
                        </button>
                    </>
                )}

                <div className="flex-1" />

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
                <aside className="rail w-[264px] shrink-0 flex flex-col pt-3 pb-3 overflow-y-auto relative z-30" aria-label="Primary">
                    <nav>
                        {NAV.map(({ id, label, Icon, onClick, count, countRun }) => (
                            <React.Fragment key={id}>
                                <button
                                    type="button"
                                    onClick={onClick || (() => setActiveTab(id))}
                                    className={`navlink ${activeTab === id ? 'on' : ''}`}
                                    aria-current={activeTab === id ? 'page' : undefined}
                                    aria-expanded={id === 'policy' ? activeTab === 'policy' && reportsOpen : undefined}
                                >
                                    <Icon className="w-4 h-4" strokeWidth={1.5} />
                                    {label}
                                    {count != null && (
                                        <span className="num ml-auto text-[11px]" style={{ color: activeTab === id ? '#D6E1F0' : countRun ? 'var(--accent-text)' : 'var(--mute-2)' }}>{count}</span>
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
                                                        onClick={() => { setReportView(t.id); setActiveTab('policy'); }}
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
                            onStartScan={startScan}
                            isScanning={anyRunning}
                            runningTypes={new Set([...serverRuns.map(r => r.scan_type), isScanning && activeScanType])}
                            onNavigateToSettings={(section) => {
                                setSettingsSection(section);
                                setActiveTab('settings');
                            }}
                        />
                    )}


                </aside>

                <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
                    {activeTab === 'dashboard' ? (
                        <div className="flex-1 min-h-0 overflow-auto px-7 pt-[18px] pb-6">
                            <DashboardCharts key={statsVersion} />
                        </div>
                    ) : activeTab === 'reports' ? (
                        <ReportViewer
                            live={liveScan && { ...liveScan, label: SCAN_LABELS[liveScan.type] ?? liveScan.type, logs, isScanning }}
                            active={serverRuns}
                            labelFor={(t) => SCAN_LABELS[t] ?? t}
                        />
                    ) : activeTab === 'policy' ? (
                        <PolicyReports activeView={reportView} />
                    ) : activeTab === 'settings' ? (
                        <Settings initialSection={settingsSection} />
                    ) : activeTab === 'terminal' ? (
                        <WebTerminal />
                    ) : null}
                </main>
            </div>
        </div>
    );
}

export default App;
