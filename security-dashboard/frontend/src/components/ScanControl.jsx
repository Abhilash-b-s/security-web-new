import React, { useState } from 'react';
import { Play, Shield, Activity, Layers, Terminal, Code, GitGraph } from 'lucide-react';

const SCAN_TYPES = [
    { id: 'trivy-image', label: 'Image Vulnerabilities', icon: <Layers className="w-4 h-4" /> },
    { id: 'trivy-sbom', label: 'SBOM Inventory', icon: <Layers className="w-4 h-4" /> },
    { id: 'trivy-repo', label: 'Source Code Scan', icon: <GitGraph className="w-4 h-4" /> },
    { id: 'nmap', label: 'Network Security Scan', icon: <Terminal className="w-4 h-4" /> },
    { id: 'kyverno', label: 'Policy Compliance', icon: <Activity className="w-4 h-4" /> },
    { id: 'kube-bench', label: 'CIS Benchmarks', icon: <Shield className="w-4 h-4" /> },
    { id: 'trivy-cluster', label: 'Cluster Risks Scan', icon: <Layers className="w-4 h-4" /> },
];

export default function ScanControl({ onStartScan, isScanning }) {

    const handleStartScan = (typeId) => {
        // Registry credentials are now managed in Settings and loaded by backend
        onStartScan(typeId, {});
    };

    return (
        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 shadow-xl w-full">
            <h2 className="text-xl font-semibold mb-4 text-white flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-400" />
                Security Operations
            </h2>

            <div className="flex flex-col gap-4 mb-6">
                {SCAN_TYPES.map((type) => (
                    <button
                        key={type.id}
                        onClick={() => handleStartScan(type.id)}
                        disabled={isScanning}
                        className={`flex items-center gap-2 py-2 px-3 rounded-lg border transition-all w-full ${isScanning
                            ? 'opacity-50 cursor-not-allowed bg-gray-700 border-gray-600'
                            : 'bg-gray-700/50 border-gray-600 hover:bg-blue-600/40 hover:border-blue-400 hover:shadow-lg hover:shadow-blue-500/20'
                            }`}
                    >
                        <div className="p-1.5 bg-gray-700 rounded-md text-blue-400">
                            {React.cloneElement(type.icon, { className: "w-3.5 h-3.5" })}
                        </div>
                        <span className="font-medium text-sm">{type.label}</span>
                    </button>
                ))}
            </div>

            <button
                onClick={() => handleStartScan('all')}
                disabled={isScanning}
                className={`w-full py-2 px-3 text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-all ${isScanning
                    ? 'bg-gray-700/50 border border-gray-600 opacity-50 cursor-not-allowed text-gray-400'
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                    }`}
                title="Run All Scans"
            >
                <Play className="w-3.5 h-3.5 fill-current" />
                Run All Scans
            </button>
        </div>
    );
}
