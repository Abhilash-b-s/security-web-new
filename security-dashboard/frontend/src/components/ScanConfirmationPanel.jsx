import React, { useEffect, useState } from 'react';
import { AlertCircle, X, Shield, Play } from 'lucide-react';

export default function ScanConfirmationPanel({ isOpen, onClose, onConfirm, scanLabel }) {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setIsVisible(true);
        } else {
            const timer = setTimeout(() => setIsVisible(false), 300); // Wait for animation
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    if (!isOpen && !isVisible) return null;

    return (
        <div className="absolute top-0 h-full w-full lg:w-auto lg:left-full z-10 pointer-events-none">
            {/* Backdrop */}
            <div
                className={`fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300 ease-in-out z-0 lg:z-[-1] ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Panel */}
            <div className={`absolute top-0 left-0 lg:left-0 h-full w-full lg:w-96 flex pointer-events-auto transform transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] z-10 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="w-full h-full bg-white dark:bg-slate-800 shadow-2xl pointer-events-auto flex flex-col border-l border-slate-200 dark:border-slate-700">

                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700">
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <Shield className="w-6 h-6 text-azure-600 dark:text-azure-400" />
                            Confirm Scan
                        </h2>
                        <button
                            onClick={onClose}
                            className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300 transition-colors p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
                            aria-label="Close panel"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 p-6 overflow-y-auto">
                        <div className="flex flex-col gap-6">
                            <div className="p-4 bg-azure-50 dark:bg-azure-900/20 rounded-xl border border-azure-100 dark:border-azure-800">
                                <h3 className="text-sm font-semibold text-azure-900 dark:text-azure-100 uppercase tracking-wider mb-2">
                                    Selected Scan
                                </h3>
                                <p className="text-lg font-medium text-azure-700 dark:text-azure-300">
                                    {scanLabel}
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-start gap-3">
                                    <div className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg mt-1">
                                        <AlertCircle className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                                    </div>
                                    <div>
                                        <h4 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
                                            Scan Confirmation
                                        </h4>
                                        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                            This process will analyze your <span className="font-semibold text-slate-800 dark:text-slate-200">Kubernetes cluster</span> for potential security risks, vulnerabilities, and misconfigurations.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3">
                                    <div className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg mt-1">
                                        <Play className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                                    </div>
                                    <div>
                                        <h4 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
                                            Execution
                                        </h4>
                                        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                            The scan will run in the background. You can monitor the progress in the terminal window.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={onClose}
                                className="flex-1 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-all focus:outline-none focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={onConfirm}
                                className="flex-1 px-4 py-3 text-sm font-medium text-white bg-gradient-to-r from-azure-600 to-azure-700 hover:from-azure-700 hover:to-azure-800 rounded-lg shadow-md hover:shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-azure-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 flex items-center justify-center gap-2"
                            >
                                <Play className="w-4 h-4 fill-current" />
                                Start Scan
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
