import React, { useState } from 'react';
import PasswordInput from './PasswordInput';

const Login = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            if (!res.ok) {
                setError('Invalid credentials');
                return;
            }
            const data = await res.json();
            onLogin({ username: data.username, role: data.role, token: data.token });
        } catch {
            setError('Invalid credentials');
        }
    };

    return (
        <div className="min-h-screen w-full flex" style={{ background: 'var(--page)', color: 'var(--ink)' }}>
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
            <section className="w-full lg:w-[30%] lg:min-w-[420px] flex items-center justify-center p-8">
                <form onSubmit={handleSubmit} className="w-full max-w-[380px]">
                    <div className="eyebrow">Sign in</div>
                    <h1 className="mt-1 font-serif text-[28px] leading-9 font-medium" style={{ color: 'var(--ink)' }}>Welcome back</h1>
                    <p className="mt-1.5 text-[13px]" style={{ color: 'var(--mute)' }}>Use the account your administrator gave you.</p>

                    <div className="sheet mt-6 p-5 flex flex-col gap-3.5">
                        <label className="field">Username or email
                            <input type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} className="inp h-9" placeholder="Enter your username" autoFocus />
                        </label>
                        <label className="field">Password
                            <PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="inp h-9" placeholder="Enter your password" />
                        </label>
                        {error && <div className="note note-crit" role="alert">{error}</div>}
                        <button type="submit" className="btn btn-primary h-[38px] text-[13.5px] font-semibold">Sign in</button>
                    </div>
                    <p className="mt-3.5 text-xs leading-[18px]" style={{ color: 'var(--mute-2)' }}>
                        Superusers can run scans and use the terminal. Other users can read scan reports.
                    </p>
                </form>
            </section>
        </div>
    );
};

export default Login;
