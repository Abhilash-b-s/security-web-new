import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Send, X } from 'lucide-react';

export default function WebTerminal({ onClose }) {
    const [output, setOutput] = useState('');
    const [command, setCommand] = useState('');
    const [error, setError] = useState(null);
    const [history, setHistory] = useState([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [isConnected, setIsConnected] = useState(false);
    const wsRef = useRef(null);
    const endRef = useRef(null);

    useEffect(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/terminal/ws`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            setIsConnected(true);
            setOutput(prev => prev + "--- Terminal Connected ---\n");
        };

        ws.onmessage = (event) => {
            const message = event.data;
            setOutput(prev => prev + message);
        };

        ws.onclose = () => {
            setIsConnected(false);
            setOutput(prev => prev + "\n--- Terminal Disconnected ---\n");
        };

        return () => {
            if (wsRef.current) wsRef.current.close();
        };
    }, []);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [output]);

    const handleSend = (e) => {
        e.preventDefault();
        if (!command.trim() || !wsRef.current) return;

        if (!command.trim().startsWith("kubectl")) {
            setError("Only kubectl commands are allowed");
            return;
        }

        setError(null);
        setOutput(prev => prev + `$ ${command}\n`);
        wsRef.current.send(command);
        setHistory(prev => [...prev, command]);
        setHistoryIndex(-1);
        setCommand('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (history.length === 0) return;
            const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
            setHistoryIndex(newIndex);
            setCommand(history[newIndex]);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyIndex === -1) return;
            const newIndex = historyIndex + 1;
            if (newIndex >= history.length) {
                setHistoryIndex(-1);
                setCommand('');
            } else {
                setHistoryIndex(newIndex);
                setCommand(history[newIndex]);
            }
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#0d1117] overflow-hidden">
            {/* Title bar */}
            <div className="flex items-center gap-2 px-4 py-2 bg-[#161b22] border-b border-gray-700/60 flex-shrink-0">
                <Terminal className="w-4 h-4 text-green-400" />
                <span className="text-sm font-mono text-gray-300">kubectl Terminal</span>
                <span className={`w-2 h-2 rounded-full ml-1 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                {onClose && (
                    <button
                        onClick={onClose}
                        className="ml-auto p-1 rounded text-gray-500 hover:text-white hover:bg-gray-700 transition-colors"
                        title="Close terminal"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Output area — takes all remaining space */}
            <div className="flex-1 overflow-auto p-3 font-mono text-sm text-gray-300 whitespace-pre bg-[#0d1117]">
                {output || <span className="text-gray-600 italic">Ready. Type a kubectl command below.</span>}
                <div ref={endRef} />
            </div>

            {/* Input bar — pinned to bottom */}
            <div className="flex-shrink-0 border-t border-gray-700/60 bg-[#161b22] px-3 py-2">
                {error && <div className="text-red-400 text-xs font-mono mb-1.5">{error}</div>}
                <form onSubmit={handleSend} className="flex gap-2 items-center">
                    <span className="text-green-500 font-mono font-bold select-none text-sm">$</span>
                    <input
                        type="text"
                        value={command}
                        onChange={(e) => { setCommand(e.target.value); if (error) setError(null); }}
                        onKeyDown={handleKeyDown}
                        className="flex-1 bg-[#0d1117] border border-gray-700 rounded py-1.5 px-3 text-sm text-gray-200 font-mono focus:outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600/40 placeholder-gray-600"
                        placeholder="Enter command (e.g., kubectl get pods)"
                        autoFocus
                    />
                    <button
                        type="submit"
                        disabled={!isConnected}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </form>
            </div>
        </div>
    );
}
