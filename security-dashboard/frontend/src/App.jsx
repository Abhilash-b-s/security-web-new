import { useState, useRef, useEffect } from 'react';
import { LogOut } from 'lucide-react';
import Login from './components/Login';
import ScanControl from './components/ScanControl';
import LogViewer from './components/LogViewer';
import ReportViewer from './components/ReportViewer';
import WebTerminal from './components/WebTerminal';
import PolicyReports from './components/PolicyReports';
import Settings from './components/Settings';
import DashboardCharts from './components/DashboardCharts';
import { ShieldAlert, LayoutDashboard, FileText, Terminal, FileCheck, Settings as SettingsIcon } from 'lucide-react';

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
    const [settingsSection, setSettingsSection] = useState(null);
    const [theme, setTheme] = useState(() => {
        if (typeof window !== 'undefined' && window.localStorage) {
            return localStorage.getItem('theme') || 'dark';
        }
        return 'dark';
    });
    const wsRef = useRef(null);

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



    // Safe ID generator that works in all contexts (http/https/older browsers)
    const generateScanId = () => {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return 'scan-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    };

    const startScan = async (type) => {
        setIsScanning(true);
        setLogs([]);

        // Generate ID client-side to coordinate WS connection before trigger
        const scanId = generateScanId();

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

    return (
        <div className="min-h-screen bg-gradient-light dark:bg-none dark:bg-[#0b1220] text-slate-900 dark:text-white flex flex-col font-sans transition-colors duration-200">
            {/* Header */}
            <header className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 px-4 py-3 shadow-base dark:shadow-md transition-colors duration-200">
                <div className="flex items-center justify-between px-0">
                    <button
                        onClick={() => {
                            setActiveTab('dashboard');
                            setLogs([]);
                            setIsScanning(false);
                        }}
                        className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer"
                    >
                        <ShieldAlert className="w-8 h-8 text-azure-600 dark:text-azure-500" />
                        <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">DevSecOps Dashboard</span>
                    </button>
                    <nav className="flex gap-3 items-center">
                        {user.role === 'superuser' && (
                            <>
                                <button
                                    onClick={() => {
                                        setActiveTab('dashboard');
                                        setLogs([]);
                                        setIsScanning(false);
                                    }}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'dashboard' ? 'bg-azure-600 text-white shadow-md shadow-azure-200 dark:shadow-azure-900' : 'bg-slate-100 dark:bg-transparent text-slate-700 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-gray-700 border border-slate-300 dark:border-transparent'
                                        }`}
                                >
                                    <LayoutDashboard className="w-4 h-4" />
                                    Dashboard
                                </button>
                                <button
                                    onClick={() => setActiveTab('reports')}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'reports' ? 'bg-azure-600 text-white shadow-md shadow-azure-200 dark:shadow-azure-900' : 'bg-slate-100 dark:bg-transparent text-slate-700 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-gray-700 border border-slate-300 dark:border-transparent'
                                        }`}
                                >
                                    <FileText className="w-4 h-4" />
                                    Event Logs
                                </button>
                            </>
                        )}
                        <button
                            onClick={() => setActiveTab('policy')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'policy' ? 'bg-azure-600 text-white shadow-md shadow-azure-200 dark:shadow-azure-900' : 'bg-slate-100 dark:bg-transparent text-slate-700 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-gray-700 border border-slate-300 dark:border-transparent'
                                }`}
                        >
                            <FileCheck className="w-4 h-4" />
                            Scan Reports
                        </button>
                        {user.role === 'superuser' && (
                            <>
                                <button
                                    onClick={() => setActiveTab('terminal')}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'terminal' ? 'bg-azure-600 text-white shadow-md shadow-azure-200 dark:shadow-azure-900' : 'bg-slate-100 dark:bg-transparent text-slate-700 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-gray-700 border border-slate-300 dark:border-transparent'
                                        }`}
                                >
                                    <Terminal className="w-4 h-4" />
                                    Terminal
                                </button>
                                <button
                                    onClick={() => setActiveTab('settings')}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'settings' ? 'bg-azure-600 text-white shadow-md shadow-azure-200 dark:shadow-azure-900' : 'bg-slate-100 dark:bg-transparent text-slate-700 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-gray-700 border border-slate-300 dark:border-transparent'
                                        }`}
                                >
                                    <SettingsIcon className="w-4 h-4" />
                                    Settings
                                </button>
                            </>
                        )}

                        <div className="w-px h-6 bg-slate-300 dark:bg-gray-700 mx-2"></div>

                        <button
                            onClick={toggleTheme}
                            className="p-2 rounded-lg text-slate-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors"
                            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                        >
                            {theme === 'dark' ? (
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-sun"><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-moon"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>
                            )}
                        </button>

                        <div className="flex items-center gap-1 ml-2">
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 hidden sm:block">
                                {user?.username || 'User'}
                            </span>
                            <button
                                onClick={handleLogout}
                                className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                title="Logout"
                            >
                                <LogOut className="w-5 h-5" />
                            </button>
                        </div>
                    </nav>
                </div>
            </header >

            {/* Main Content */}
            < main className={`flex-1 flex flex-col overflow-hidden ${activeTab === 'policy' ? 'p-2' : ''}`
            }>
                {activeTab === 'dashboard' ? (
                    <div className="flex-1 flex flex-col lg:flex-row min-h-0">
                        {/* Left Sidebar: Scan Controls - Full height, no margins */}
                        <div className="w-full lg:w-72 flex-shrink-0 bg-white dark:bg-gray-800 border-r border-slate-200 dark:border-gray-700 relative z-30 h-full">
                            <ScanControl
                                onStartScan={startScan}
                                isScanning={isScanning}
                                onNavigateToSettings={(section) => {
                                    setSettingsSection(section);
                                    setActiveTab('settings');
                                }}
                            />
                        </div>

                        {/* Right Side: Charts or Terminal */}
                        <div className="flex-1 min-w-0 overflow-auto p-6">
                            {!isScanning && logs.length === 0 ? (
                                // Show charts before scan starts
                                <DashboardCharts />
                            ) : (
                                // Show terminal when scan is running or has logs
                                <div className="h-full">
                                    <LogViewer logs={logs} />
                                </div>
                            )}
                        </div>
                    </div>
                ) : activeTab === 'reports' ? (
                    <div className="p-6">
                        <ReportViewer />
                    </div>
                ) : activeTab === 'policy' ? (
                    <PolicyReports />
                ) : activeTab === 'settings' ? (
                    <Settings initialSection={settingsSection} />
                ) : (
                    <div className="p-6">
                        <WebTerminal />
                    </div>
                )
                }
            </main >
        </div >
    );
}

export default App;
