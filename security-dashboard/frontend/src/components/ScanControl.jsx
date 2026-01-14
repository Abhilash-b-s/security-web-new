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
        <div className="h-full flex flex-col">
            <div className="p-6 border-b border-slate-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <div className="p-2 bg-gradient-blue rounded-lg">
                        <Activity className="w-5 h-5 text-azure-600" />
                    </div>
                    Security Operations
                </h2>
            </div>

            <div className="flex-1 flex flex-col overflow-y-auto">
                {SCAN_TYPES.map((type) => (
                    <button
                        key={type.id}
                        onClick={() => handleStartScan(type.id)}
                        disabled={isScanning}
                        className={`flex items-center gap-3 py-3 px-6 border-b border-slate-200 dark:border-gray-700 transition-all duration-200 w-full font-medium text-sm transform ${isScanning
                            ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-gray-800 text-slate-500 dark:text-gray-400'
                            : 'bg-white dark:bg-gray-800 hover:bg-azure-50 dark:hover:bg-azure-600/10 text-slate-900 dark:text-gray-200 hover:text-azure-800 dark:hover:text-azure-100 hover:border-l-4 hover:border-l-azure-500 hover:shadow-lg hover:shadow-azure-500/20 hover:scale-[1.01] hover:-translate-x-1'
                            }`}
                    >
                        <div className={`p-2 bg-slate-100 dark:bg-gray-700 rounded-lg text-azure-700 dark:text-azure-400 transition-all duration-200 ${!isScanning ? 'group-hover:bg-azure-100 dark:group-hover:bg-azure-500/20' : ''}`}>
                            {React.cloneElement(type.icon, { className: "w-4 h-4" })}
                        </div>
                        <span>{type.label}</span>
                    </button>
                ))}
            </div>

            <div className="p-4 bg-slate-50 dark:bg-gray-900/50 border-t border-slate-200 dark:border-gray-700 mt-auto">
                <button
                    onClick={() => { }}
                    disabled={true}
                    className="w-full py-3 px-4 text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-all bg-slate-200 dark:bg-gray-700/50 border border-slate-300 dark:border-gray-600 opacity-50 cursor-not-allowed text-slate-400 dark:text-gray-500"
                    title="Run All Scans (Disabled)"
                >
                    <Play className="w-4 h-4 fill-current" />
                    Run All Scans
                </button>
            </div>
        </div>
    );
}
