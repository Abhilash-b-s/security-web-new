import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

// Password field with an eye button to show/hide the value. Props go to the <input>.
export default function PasswordInput({ className = '', ...props }) {
    const [show, setShow] = useState(false);
    const Icon = show ? EyeOff : Eye;
    return (
        <span className="relative block">
            <input {...props} type={show ? 'text' : 'password'} className={`${className} pr-9`} />
            <button
                type="button"
                onClick={() => setShow(s => !s)}
                aria-label={show ? 'Hide password' : 'Show password'}
                aria-pressed={show}
                title={show ? 'Hide' : 'Show'}
                className="absolute inset-y-0 right-0 flex items-center px-2.5 bg-transparent border-0 cursor-pointer"
                style={{ color: 'var(--mute)' }}
            >
                <Icon className="w-4 h-4" strokeWidth={1.6} />
            </button>
        </span>
    );
}
