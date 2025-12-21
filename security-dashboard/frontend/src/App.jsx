import React, { useState, useRef, useEffect } from 'react';
import ScanControl from './components/ScanControl';
import LogViewer from './components/LogViewer';
import ReportViewer from './components/ReportViewer';
import WebTerminal from './components/WebTerminal';
import PolicyReports from './components/PolicyReports';
import Settings from './components/Settings';
import { ShieldAlert, LayoutDashboard, FileText, Terminal, FileCheck, Settings as SettingsIcon } from 'lucide-react';




function App() {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [logs, setLogs] = useState([]);
    const [isScanning, setIsScanning] = useState(false);
    const [currentScanId, setCurrentScanId] = useState(null);
    const wsRef = useRef(null);

    // Safe ID generator that works in all contexts (http/https/older browsers)
    const generateScanId = () => {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return 'scan-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    };

    const startScan = async (type, credentials = {}) => {
        setIsScanning(true);
        setLogs([]); // Clear logs for new scan

        // Generate ID client-side to coordinate WS connection before trigger
        const scanId = generateScanId();
        setCurrentScanId(scanId);

        try {
            // 1. Connect WebSocket FIRST (with timeout)
            setLogs(prev => [...prev, "Initializing connection..."]);
            await connectWebSocket(scanId);

            // 2. TRIGGER the scan once connected
            setLogs(prev => [...prev, "Starting scan process..."]);
            const response = await fetch('/api/scans/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    scan_type: type,
                    scan_id: scanId,
                    registry_user: credentials.registryUser,
                    registry_password: credentials.registryPassword
                }),
            });

            if (!response.ok) {
                throw new Error(`Failed to start scan: ${response.statusText}`);
            }

        } catch (error) {
            console.error("Error starting scan:", error);
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

            console.log("Connecting to WS:", wsUrl);
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
                    // Smart Appending Logic for "Vertical Dots"
                    setLogs(prev => {
                        if (prev.length === 0) return [message];
                        const lastIndex = prev.length - 1;
                        const lastLog = prev[lastIndex];

                        // If message is just dots or continuation chars, append to last line
                        if (message.startsWith('.') || (lastLog && !lastLog.endsWith('\n') && message.length < 50)) {
                            // Simple heuristic: if short message starting with dot, append
                            // Or simply always append if it looks like a progress chunk
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

            ws.onerror = (error) => {
                console.error("WebSocket Error:", error);
                // Only reject if we haven't resolved yet
                // Use readyState to check if we are still connecting
                if (ws.readyState === WebSocket.CONNECTING) {
                    clearTimeout(timeoutId);
                    reject(new Error("WebSocket connection failed"));
                } else {
                    setLogs(prev => [...prev, "--- Connection Error ---"]);
                }
            };

            ws.onclose = () => {
                console.log("WebSocket Disconnected");
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

    return (
        <div className="h-screen bg-gray-900 text-white flex flex-col font-sans overflow-hidden">
            {/* Header */}
            <header className="bg-gray-800 border-b border-gray-700 p-4 shadow-md">
                <div className="flex items-center justify-between px-0">
                    <div className="flex items-center gap-3">
                        <img src="/logo-mobile.webp" alt="Logo" className="w-40 h-10 object-contain" />
                        <ShieldAlert className="w-8 h-8 text-blue-500" />
                    </div>
                    <nav className="flex gap-4 items-center">
                        <button
                            onClick={() => setActiveTab('dashboard')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                                }`}
                        >
                            <LayoutDashboard className="w-4 h-4" />
                            Dashboard
                        </button>
                        <button
                            onClick={() => setActiveTab('reports')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'reports' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                                }`}
                        >
                            <FileText className="w-4 h-4" />
                            Event Logs
                        </button>
                        <button
                            onClick={() => setActiveTab('policy')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'policy' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                                }`}
                        >
                            <FileCheck className="w-4 h-4" />
                            Scan Reports
                        </button>
                        <button
                            onClick={() => setActiveTab('terminal')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'terminal' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                                }`}
                        >
                            <Terminal className="w-4 h-4" />
                            Terminal
                        </button>
                        <button
                            onClick={() => setActiveTab('settings')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'settings' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                                }`}
                        >
                            <SettingsIcon className="w-4 h-4" />
                            Settings
                        </button>
                        <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 rounded-md border border-gray-700 ml-2">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                            </span>
                            <span className="text-green-400 text-sm font-medium">System Online</span>
                        </div>
                    </nav>
                </div>
            </header>

            {/* Main Content */}
            < main className="flex-1 flex flex-col p-6 overflow-hidden" >
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
