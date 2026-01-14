import React, { useEffect, useRef, useState } from 'react';
import { Terminal as TerminalIcon, Copy, Check, Download } from 'lucide-react';

export default function LogViewer({ logs }) {
    const scrollRef = useRef(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    const handleCopy = () => {
        const text = logs.join('\n');
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
        const text = logs.join('\n');
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `scan-logs-${new Date().toISOString()}.txt`;
        a.click();
    };

    return (
        <div className="bg-white dark:bg-[#1e1e1e] rounded-lg border border-slate-200 dark:border-[#333] shadow-lg dark:shadow-2xl flex flex-col h-full overflow-hidden font-mono text-sm leading-6 transition-colors duration-200">
            {/* Header */}
            <div className="bg-slate-50 dark:bg-[#252526] px-4 py-3 border-b border-slate-200 dark:border-[#333] flex items-center justify-between shrink-0 transition-colors duration-200">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-gradient-blue rounded">
                        <TerminalIcon className="w-4 h-4 text-azure-600" />
                    </div>
                    <span className="text-slate-900 dark:text-gray-300 font-semibold tracking-wide text-xs uppercase">Event Logs</span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={handleCopy}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-[#3c3c3c] rounded text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                        title="Copy All"
                    >
                        {copied ? <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button
                        onClick={handleDownload}
                        className="p-1.5 hover:bg-slate-200 dark:hover:bg-[#3c3c3c] rounded text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                        title="Download Logs"
                    >
                        <Download className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Terminal Body */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 space-y-0.5 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-gray-700 scrollbar-track-transparent bg-white dark:bg-[#1e1e1e]"
                style={{ fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace" }}
            >
                {logs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-600 dark:text-gray-600">
                        <TerminalIcon className="w-12 h-12 mb-4 opacity-20" />
                        <p>Waiting for scan initialization...</p>
                    </div>
                ) : (
                    logs.map((log, i) => {
                        // Replace tabs with 2 spaces for better wrapping
                        const processedLog = log.replace(/\t/g, '  ');
                        return (
                        <div key={i} className="flex group hover:bg-slate-50/50 dark:hover:bg-white/5">
                            {/* Line Number */}
                            <span className="w-8 text-right text-slate-400 dark:text-gray-600 select-none mr-4 text-xs pt-[2px] opacity-50 group-hover:opacity-100">
                                {i + 1}
                            </span>
                            {/* Log Content */}
                            <div className="flex-1 overflow-hidden" style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                                {processedLog.startsWith('$') ? (
                                    <span className="text-amber-700 dark:text-amber-400 font-bold">{processedLog}</span>
                                ) : processedLog.startsWith('Error') || processedLog.includes('Failed') ? (
                                    <span className="text-red-700 dark:text-red-400">{processedLog}</span>
                                ) : processedLog.includes('===') || processedLog.includes('---') ? (
                                    <span className="text-azure-700 dark:text-azure-400 font-semibold">{processedLog}</span>
                                ) : processedLog.includes('SUCCESS') || processedLog.includes('✓') ? (
                                    <span className="text-green-700 dark:text-green-400">{processedLog}</span>
                                ) : processedLog.includes('⚠') || processedLog.includes('WARN') ? (
                                    <span className="text-yellow-700 dark:text-yellow-400">{processedLog}</span>
                                ) : (
                                    <span className="text-slate-700 dark:text-[#d4d4d4]">{processedLog}</span>
                                )}
                            </div>
                        </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
