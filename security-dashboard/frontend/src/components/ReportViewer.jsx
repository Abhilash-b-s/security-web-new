import React, { useEffect, useState } from 'react';
import { FileText, CheckCircle, XCircle, Clock, ChevronRight, Download, Activity, Search, Shield, Layers, Terminal as TerminalIcon } from 'lucide-react';

export default function ReportViewer() {
    const [reports, setReports] = useState([]);
    const [selectedReport, setSelectedReport] = useState(null);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchReports();
    }, []);

    const fetchReports = async () => {
        try {
            const res = await fetch('/api/reports/');
            const data = await res.json();
            // Sort by timestamp desc
            data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            setReports(data);
        } catch (err) {
            console.error("Failed to fetch reports:", err);
        }
    };

    const loadReportDetails = async (id) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/reports/${id}`);
            const data = await res.json();
            setSelectedReport(data);
        } catch (err) {
            console.error("Failed to load report:", err);
        } finally {
            setLoading(false);
        }
    };

    const getScanIcon = (type) => {
        const lower = type?.toLowerCase() || '';
        if (lower.includes('kube-bench')) return <Shield className="w-5 h-5 text-purple-400" />;
        if (lower.includes('kyverno')) return <Activity className="w-5 h-5 text-pink-400" />;
        if (lower.includes('trivy')) return <Layers className="w-5 h-5 text-blue-400" />;
        if (lower.includes('nmap')) return <TerminalIcon className="w-5 h-5 text-orange-400" />;
        return <FileText className="w-5 h-5 text-gray-400" />;
    };

    const filteredReports = reports.filter(r =>
        r.scan_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.id.includes(searchTerm)
    );

    return (
        <div className="bg-gray-900 rounded-xl border border-gray-800 shadow-2xl overflow-hidden flex h-[calc(100vh-140px)]">

            {/* Sidebar List */}
            <div className="w-80 border-r border-gray-800 bg-[#0d0f12] flex flex-col shadow-[4px_0_24px_-2px_rgba(0,0,0,0.3)] z-10">
                <div className="p-5 border-b border-gray-800 bg-[#0f1115]">
                    <h3 className="text-white font-bold text-sm tracking-wider uppercase mb-4 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-blue-500" />
                        Scan History
                    </h3>
                    <div className="relative group">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500 group-focus-within:text-blue-400 transition-colors" />
                        <input
                            type="text"
                            placeholder="Filter reports..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-[#1a1d23] border border-gray-800 rounded-lg py-2 pl-9 pr-4 text-sm text-gray-300 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none placeholder-gray-600 transition-all shadow-inner"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin scrollbar-thumb-gray-800">
                    {filteredReports.map((report) => (
                        <button
                            key={report.id}
                            onClick={() => loadReportDetails(report.id)}
                            className={`w-full group relative text-left p-3 rounded-xl border transition-all duration-300 ease-out overflow-hidden hover:shadow-lg ${selectedReport?.id === report.id
                                ? 'bg-gradient-to-br from-blue-900/20 to-indigo-900/20 border-blue-500/50 shadow-blue-900/10'
                                : 'bg-[#16181d] border-gray-800 hover:border-gray-700 hover:bg-[#1c1f26]'
                                }`}
                        >
                            {/* Card Content */}
                            <div className="flex items-start gap-4 relative z-10">
                                {/* Icon Container */}
                                <div className={`p-2 rounded-lg shrink-0 transition-colors ${selectedReport?.id === report.id ? 'bg-blue-500/10' : 'bg-gray-800/50 group-hover:bg-gray-800'
                                    }`}>
                                    {getScanIcon(report.scan_type)}
                                </div>

                                <div className="flex-1 min-w-0 py-0.5">
                                    <div className="flex justify-between items-start mb-1">
                                        <div className={`font-semibold text-sm truncate pr-2 ${selectedReport?.id === report.id ? 'text-blue-400' : 'text-gray-200 group-hover:text-white'
                                            }`}>
                                            {report.scan_type || 'Unknown Scan'}
                                        </div>
                                        {/* Status Dot */}
                                        <div className={`w-2 h-2 rounded-full shadow-sm mt-1.5 ${report.status === 'completed' ? 'bg-green-500 shadow-green-500/50' : 'bg-red-500 shadow-red-500/50'
                                            }`} />
                                    </div>

                                    <div className="flex items-center gap-2 text-xs text-gray-500 font-mono">
                                        <span>{new Date(report.timestamp).toLocaleDateString()}</span>
                                        <span className="w-1 h-1 rounded-full bg-gray-700" />
                                        <span>{new Date(report.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Active Indicator Bar */}
                            {selectedReport?.id === report.id && (
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 to-indigo-600" />
                            )}
                        </button>
                    ))}

                    {filteredReports.length === 0 && (
                        <div className="flex flex-col items-center justify-center p-8 text-gray-500/50">
                            <FileText className="w-8 h-8 mb-2" />
                            <p className="text-xs">No reports found</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Report Detail View */}
            <div className="flex-1 bg-gray-950 overflow-y-auto">
                {selectedReport ? (
                    <div className="p-8 max-w-5xl mx-auto">
                        {/* Detail Header */}
                        <div className="flex justify-between items-start mb-8 bg-gray-900/50 backdrop-blur p-8 rounded-2xl border border-gray-800/50 shadow-2xl">
                            <div>
                                <div className="flex items-center gap-4 mb-3">
                                    <div className="p-3 bg-gray-800 rounded-xl">
                                        {getScanIcon(selectedReport.request.scan_type)}
                                    </div>
                                    <div>
                                        <h2 className="text-3xl font-bold text-white capitalize tracking-tight mb-1">
                                            {selectedReport.request.scan_type}
                                        </h2>
                                        <div className="flex items-center gap-2 text-sm text-gray-400">
                                            <span className="font-mono text-gray-500">ID: {selectedReport.id.slice(0, 8)}</span>
                                            <span className="w-1 h-1 rounded-full bg-gray-700" />
                                            <span>Full Report</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <div className="text-right mr-4">
                                    <div className="text-sm text-gray-400 mb-1">Scanned on</div>
                                    <div className="text-white font-medium flex items-center gap-2 justify-end">
                                        <Clock className="w-4 h-4 text-blue-500" />
                                        {new Date(selectedReport.timestamp).toLocaleString()}
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        const blob = new Blob([JSON.stringify(selectedReport, null, 2)], { type: 'application/json' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `report-${selectedReport.id}.json`;
                                        a.click();
                                    }}
                                    className="h-fit px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2"
                                >
                                    <Download className="w-4 h-4" />
                                    <span>JSON</span>
                                </button>
                            </div>
                        </div>

                        {/* Detail Content */}
                        <div className="space-y-6">
                            {selectedReport.results.map((res, idx) => (
                                <div key={idx} className="bg-[#0f1115] rounded-xl border border-gray-800/50 overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 group">
                                    <div className="px-6 py-4 border-b border-gray-800/50 flex justify-between items-center bg-gray-800/20 group-hover:bg-gray-800/30 transition-colors">
                                        <div className="flex items-center gap-4">
                                            {res.status === 'completed' ? (
                                                <div className="p-1.5 bg-green-500/10 rounded-full ring-1 ring-green-500/20">
                                                    <CheckCircle className="w-5 h-5 text-green-500" />
                                                </div>
                                            ) : (
                                                <div className="p-1.5 bg-red-500/10 rounded-full ring-1 ring-red-500/20">
                                                    <XCircle className="w-5 h-5 text-red-500" />
                                                </div>
                                            )}
                                            <span className="font-semibold text-gray-200 text-lg tracking-wide">
                                                {res.scan_type}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="relative">
                                        <pre className="p-6 text-xs font-mono text-gray-300 overflow-x-auto whitespace-pre-wrap bg-[#0a0c10] leading-relaxed border-t border-black/20">
                                            {res.output || <span className="text-gray-600 italic">No output captured for this scan section.</span>}
                                        </pre>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-600 bg-gray-950/50">
                        <div className="w-32 h-32 bg-gray-900/50 rounded-full flex items-center justify-center mb-6 ring-1 ring-gray-800">
                            <Activity className="w-12 h-12 text-gray-800" />
                        </div>
                        <h3 className="text-xl font-medium text-gray-500 mb-2">Select a Report</h3>
                        <p className="text-gray-600 max-w-sm text-center text-sm">
                            Click on any report in the sidebar to inspect detailed security analysis and metrics.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
