import React, { useState } from 'react';
import { Play, Shield, Activity, Layers, Terminal, GitGraph } from 'lucide-react';

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
        onStartScan(typeId);
    };

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-slate-200 dark:border-gray-700 shadow-lg dark:shadow-xl w-full transition-all duration-200 hover:shadow-xl dark:hover:shadow-2xl">
            <h2 className="text-lg font-semibold mb-5 text-slate-900 dark:text-white flex items-center gap-2">
                <div className="p-2 bg-gradient-blue rounded-lg">
                    <Activity className="w-5 h-5 text-azure-600" />
                </div>
                Security Operations
            </h2>

            <div className="flex flex-col gap-3 mb-6">
                {SCAN_TYPES.map((type) => (
                    <button
                        key={type.id}
                        onClick={() => handleStartScan(type.id)}
                        disabled={isScanning}
                        className={`flex items-center gap-3 py-1.5 px-4 rounded-lg border transition-all w-full font-medium text-sm ${isScanning
                            ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-gray-700 border-slate-300 dark:border-gray-600 text-slate-500 dark:text-gray-400'
                            : 'bg-slate-50 dark:bg-gray-700/50 border-slate-300 dark:border-gray-600 hover:bg-azure-50 dark:hover:bg-azure-600/20 hover:border-azure-400 dark:hover:border-azure-400 hover:shadow-md hover:shadow-azure-200/50 dark:hover:shadow-azure-900/30 text-slate-900 dark:text-gray-200 hover:text-azure-800 dark:hover:text-azure-100'
                            }`}
                    >
                        <div className="p-2 bg-slate-200 dark:bg-gray-700 rounded-lg text-azure-700 dark:text-azure-400">
                            {React.cloneElement(type.icon, { className: "w-4 h-4" })}
                        </div>
                        <span>{type.label}</span>
                    </button>
                ))}
            </div>

            <button
                onClick={() => { }}
                disabled={true}
                className="w-full py-3 px-4 text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-all bg-slate-100 dark:bg-gray-700/50 border border-slate-300 dark:border-gray-600 opacity-50 cursor-not-allowed text-slate-400 dark:text-gray-500"
                title="Run All Scans (Disabled)"
            >
                <Play className="w-4 h-4 fill-current" />
                Run All Scans
            </button>
        </div>
    );
}
