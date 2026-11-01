import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

// 'local' is the cluster the dashboard pod runs in; other clusters are registered kubeconfigs (Settings -> Clusters).
const LOCAL = 'local';
const KEY = 'cluster';

// Report files: local lives at /new/<path>, other clusters at /new/clusters/<name>/<path>.
export const newUrl = (cluster, path) => (!cluster || cluster === LOCAL ? `/new/${path}` : `/new/clusters/${encodeURIComponent(cluster)}/${path}`);
// API url with ?cluster= appended (the backend defaults to local).
export const apiUrl = (cluster, url) => `${url}${url.includes('?') ? '&' : '?'}cluster=${encodeURIComponent(cluster || LOCAL)}`;

const Ctx = createContext({ cluster: LOCAL, setCluster: () => { }, clusters: [], refresh: () => { } });
export const useCluster = () => useContext(Ctx);

const stored = () => { try { return localStorage.getItem(KEY) || LOCAL; } catch { return LOCAL; } };

export function ClusterProvider({ children }) {
    const [cluster, setSelected] = useState(stored);
    const [clusters, setClusters] = useState([]);

    // Called by App once logged in (an unauthenticated /api call would make the fetch wrapper reload the page).
    const refresh = useCallback(() => fetch('/api/clusters')
        .then(r => (r.ok ? r.json() : []))
        .then(list => {
            const l = Array.isArray(list) ? list : [];
            setClusters(l);
            // A removed cluster falls back to local.
            if (l.length && !l.some(c => c.name === stored())) { try { localStorage.setItem(KEY, LOCAL); } catch { } setSelected(LOCAL); }
        })
        .catch(() => { }), []);

    const setCluster = useCallback((name) => {
        try { localStorage.setItem(KEY, name); } catch { }
        setSelected(name);
    }, []);

    return <Ctx.Provider value={{ cluster, setCluster, clusters, refresh }}>{children}</Ctx.Provider>;
}
