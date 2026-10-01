import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './fonts.css'
import './index.css'

// Inject Authorization: Bearer <token> on all /api/* and /new/* requests (except /api/login).
// A 401 means the token is missing/expired -> log out and reload.
const _origFetch = window.fetch.bind(window)
window.fetch = async (input, init = {}) => {
    let isAuthed = false
    try {
        const url = typeof input === 'string' ? input : (input && input.url) || ''
        isAuthed = (url.startsWith('/api/') || url.startsWith('/new/')) && url !== '/api/login'
        if (isAuthed) {
            const user = JSON.parse(localStorage.getItem('user') || 'null')
            if (user && user.token) {
                init = { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${user.token}` } }
            }
        }
    } catch {
        // localStorage/JSON failure must never break fetch; proceed without the header
    }
    const res = await _origFetch(input, init)
    if (isAuthed && res.status === 401) {
        try { localStorage.removeItem('user') } catch {}
        window.location.reload()
    }
    return res
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)
