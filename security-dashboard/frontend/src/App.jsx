import React, { useState, useRef, useEffect } from 'react';
import { ShieldCheck, Lock, LogOut } from 'lucide-react';
import Login from './components/Login';
import ScanControl from './components/ScanControl';
import LogViewer from './components/LogViewer';
import ReportViewer from './components/ReportViewer';
import WebTerminal from './components/WebTerminal';
import PolicyReports from './components/PolicyReports';
import Settings from './components/Settings';
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
                    // Append message, combining progress dots with previous line
                    setLogs(prev => {
                        if (prev.length === 0) return [message];
                        const lastIndex = prev.length - 1;
                        const lastLog = prev[lastIndex];

                        // If message is dots or continuation, append to last line
                        if (message.startsWith('.') || (lastLog && !lastLog.endsWith('\n') && message.length < 50)) {
                            if (message.match(/^\.+$/)) {
                                const newLogs = [...prev];
                                newLogs[lastIndex] = lastLog + message;
                                return newLogs;
                            }
                        }
                        return [...prev, message];
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
                    <div className="flex items-center gap-3">
                        <ShieldAlert className="w-8 h-8 text-azure-600 dark:text-azure-500" />
                        <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">DevSecOps Dashboard</span>
                    </div>
                    <nav className="flex gap-3 items-center">
                        {user.role === 'superuser' && (
                            <>
                                <button
                                    onClick={() => setActiveTab('dashboard')}
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
            < main className={`flex-1 flex flex-col overflow-hidden ${activeTab === 'policy' ? 'p-2' : 'p-6'}`
            }>
                {activeTab === 'dashboard' ? (
                    <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
                        {/* Left Sidebar: Scan Controls & Status */}
                        <div className="w-full lg:w-72 flex-shrink-0 flex flex-col gap-6">
                            <ScanControl onStartScan={startScan} isScanning={isScanning} />
                        </div>

                        {/* Right Side: Terminal */}
                        <div className="flex-1 h-full min-w-0">
                            <LogViewer logs={logs} />
                        </div>
                    </div>
                ) : activeTab === 'reports' ? (
                    <ReportViewer />
                ) : activeTab === 'policy' ? (
                    <PolicyReports />
                ) : activeTab === 'settings' ? (
                    <Settings />
                ) : (
                    <div className="h-full">
                        <WebTerminal />
                    </div>
                )
                }
            </main >
        </div >
    );
}

export default App;
