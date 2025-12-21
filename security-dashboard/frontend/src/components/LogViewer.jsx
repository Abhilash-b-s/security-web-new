import React, { useEffect, useRef, useState } from 'react';
import { Terminal as TerminalIcon, Copy, Trash2, Check, Download } from 'lucide-react';

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
        <div className="bg-[#1e1e1e] rounded-lg border border-[#333] shadow-2xl flex flex-col h-full overflow-hidden font-mono text-sm leading-6">
            {/* Header */}
            <div className="bg-[#252526] px-4 py-2 border-b border-[#333] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                    <TerminalIcon className="w-4 h-4 text-blue-400" />
                    <span className="text-gray-300 font-semibold tracking-wide text-xs uppercase">Event Logs</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleCopy}
                        className="p-1.5 hover:bg-[#3c3c3c] rounded text-gray-400 hover:text-white transition-colors"
                        title="Copy All"
                    >
                        {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button
                        onClick={handleDownload}
                        className="p-1.5 hover:bg-[#3c3c3c] rounded text-gray-400 hover:text-white transition-colors"
                        title="Download Logs"
                    >
                        <Download className="w-3.5 h-3.5" />
                    </button>
                    {/* Note: Clear functionality would need to be passed from parent if we want to clear actual state */}
                </div>
            </div>

            {/* Terminal Body */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 space-y-0.5 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
                style={{ fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace" }}
            >
                {logs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-600">
                        <TerminalIcon className="w-12 h-12 mb-4 opacity-20" />
                        <p>Waiting for scan initialization...</p>
                    </div>
                ) : (
                    logs.map((log, i) => (
                        <div key={i} className="flex group hover:bg-[#2a2d2e]">
                            {/* Line Number */}
                            <span className="w-8 text-right text-gray-600 select-none mr-4 text-xs pt-[2px] opacity-50 group-hover:opacity-100">
                                {i + 1}
                            </span>
                            {/* Log Content */}
                            <div className="flex-1 break-all whitespace-pre-wrap">
                                {log.startsWith('$') ? (
                                    <span className="text-yellow-400 font-bold">{log}</span>
                                ) : log.startsWith('Error') || log.includes('Failed') ? (
                                    <span className="text-red-400">{log}</span>
                                ) : log.includes('---') ? (
                                    <span className="text-blue-400 font-bold border-b border-blue-900/50 pb-1 mb-1 block mt-2">{log}</span>
                                ) : log.includes('SUCCESS') ? (
                                    <span className="text-green-400">{log}</span>
                                ) : (
                                    <span className="text-[#d4d4d4]">{log}</span>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
