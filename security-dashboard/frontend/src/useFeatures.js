import { useState, useEffect } from 'react';

// Server feature flags (GET /api/features). Everything starts off until the server says otherwise.
export default function useFeatures(user) {
    const [features, setFeatures] = useState({ terminal: false });
    useEffect(() => {
        if (!user) return;
        fetch('/api/features').then(r => (r.ok ? r.json() : null)).then(f => f && setFeatures(f)).catch(() => { });
    }, [user]);
    return features;
}
