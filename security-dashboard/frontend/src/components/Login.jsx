import React, { useState } from 'react';
import { Mail, Lock, ShieldCheck } from 'lucide-react';

const Login = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        setError('');

        if (username === 'user' && password === 'user') {
            onLogin({ username: 'user', role: 'user' });
        } else if (username === 'superuser' && password === 'superuser') {
            onLogin({ username: 'superuser', role: 'superuser' });
        } else {
            setError('Invalid credentials');
        }
    };

    return (
        <div className="min-h-screen w-full flex bg-[#0b1220] text-white font-sans">
            {/* Left Section - Abstract Background */}
            <div className="hidden lg:flex lg:w-[70%] relative overflow-hidden bg-[#05101a]">
                {/* Abstract CSS Pattern to mimic topographic/wave lines */}
                <div className="absolute inset-0 opacity-60">
                    <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_20%_30%,_rgba(20,184,166,0.15)_0%,_transparent_50%)]"></div>
                    <div className="absolute bottom-0 right-0 w-full h-full bg-[radial-gradient(circle_at_80%_70%,_rgba(56,189,248,0.15)_0%,_transparent_50%)]"></div>
                    {/* SVG Pattern overlay */}
                    <svg className="absolute w-full h-full opacity-30" viewBox="0 0 100 100" preserveAspectRatio="none">
                        <path d="M0 50 Q 25 25 50 50 T 100 50 V 100 H 0 Z" fill="none" stroke="rgba(20,184,166,0.5)" strokeWidth="0.5" />
                        <path d="M0 60 Q 25 35 50 60 T 100 60 V 100 H 0 Z" fill="none" stroke="rgba(20,184,166,0.3)" strokeWidth="0.5" />
                        <path d="M0 40 Q 25 15 50 40 T 100 40 V 100 H 0 Z" fill="none" stroke="rgba(56,189,248,0.3)" strokeWidth="0.5" />
                        <path d="M0 30 Q 25 5 50 30 T 100 30 V 100 H 0 Z" fill="none" stroke="rgba(56,189,248,0.2)" strokeWidth="0.5" />
                        <pattern id="grid" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
                            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
                        </pattern>
                        <rect width="100%" height="100%" fill="url(#grid)" />
                    </svg>
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#0b1220]/20"></div>
            </div>

            {/* Right Section - Login Form */}
            <div className="w-full lg:w-[30%] flex items-center justify-center p-8 bg-[#0b1220]">
                <div className="w-full max-w-md space-y-8">
                    <div className="space-y-2 flex flex-col items-center text-center">
                        <div className="flex items-center gap-3 mb-2">
                            <ShieldCheck className="w-10 h-10 text-blue-500" />
                            <h1 className="text-4xl font-semibold !text-white tracking-tight" style={{ color: 'white' }}>Login</h1>
                        </div>
                        <p className="text-gray-400">Sign in to your account</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6 mt-8">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-2 text-left">Username or email</label>
                                <div className="relative group">
                                    <span className="absolute left-4 top-2 text-gray-400 group-focus-within:text-white transition-colors">
                                        <Mail className="w-6 h-6" />
                                    </span>
                                    <input
                                        type="text"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        className="w-full h-9 bg-[#020b14] text-white pl-14 pr-4 rounded-lg border border-gray-700/50 focus:border-[#14b8a6] focus:ring-1 focus:ring-[#14b8a6] outline-none transition-all placeholder-transparent"
                                        placeholder="Enter your username"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-2 text-left">Password</label>
                                <div className="relative group">
                                    <span className="absolute left-4 top-2 text-gray-400 group-focus-within:text-white transition-colors">
                                        <Lock className="w-6 h-6" />
                                    </span>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full h-9 bg-[#020b14] text-white pl-14 pr-4 rounded-lg border border-gray-700/50 focus:border-[#14b8a6] focus:ring-1 focus:ring-[#14b8a6] outline-none transition-all placeholder-transparent"
                                        placeholder="Enter your password"
                                    />
                                </div>
                            </div>
                        </div>

                        {error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-sm">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            className="w-full h-9 bg-[#157e74] hover:bg-[#115e59] text-white font-medium px-4 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#14b8a6] focus:ring-offset-2 focus:ring-offset-[#0b1220] mt-4 flex items-center justify-center"
                        >
                            Continue
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default Login;
