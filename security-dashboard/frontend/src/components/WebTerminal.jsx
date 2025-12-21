import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Send } from 'lucide-react';

export default function WebTerminal() {
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

        console.log("Connecting to Terminal WS:", wsUrl);
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

        // Validation: Only allow kubectl commands
        if (!command.trim().startsWith("kubectl")) {
            setError("Error: Only kubectl commands are allowed");
            // Do not clear command, do not add to history yet, do not send to backend
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
        <div className="flex flex-col h-full bg-gray-900 rounded-lg border border-gray-800 shadow-2xl overflow-hidden">
            <div className="bg-gray-800 px-4 py-2 border-b border-gray-700 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-green-400" />
                <span className="text-sm font-mono text-gray-400">Web Terminal (kubectl ready)</span>
                <span className={`ml-auto w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
            </div>

            <form onSubmit={handleSend} className="px-4 py-6 bg-gray-800 border-b border-gray-700 flex flex-col gap-2 shadow-md z-10">
                {error && (
                    <div className="text-red-500 text-xs font-mono px-2">
                        {error}
                    </div>
                )}
                <div className="flex gap-2 items-center">
                    <span className="text-green-500 font-mono text-lg font-bold py-1 pl-2">$</span>
                    <input
                        type="text"
                        value={command}
                        onChange={(e) => {
                            setCommand(e.target.value);
                            if (error) setError(null);
                        }}
                        onKeyDown={handleKeyDown}
                        className="flex-1 bg-transparent border-none focus:ring-0 text-white font-mono text-lg placeholder-gray-600 h-10"
                        placeholder="Enter command (e.g., kubectl get pods)"
                        autoFocus
                    />
                    <button
                        type="submit"
                        disabled={!isConnected}
                        className="p-2 text-blue-400 hover:text-white disabled:opacity-50"
                    >
                        <Send className="w-5 h-5" />
                    </button>
                </div>
            </form>

            <div className="flex-1 p-4 overflow-auto bg-gray-950 font-mono text-sm text-gray-300 whitespace-pre shadow-inner">
                {output}
                <div ref={endRef} />
            </div>
        </div>
    );
}
