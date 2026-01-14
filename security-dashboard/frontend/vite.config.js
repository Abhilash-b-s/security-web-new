import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    build: {
        // Optimize bundle size
        minify: 'terser',
        terserOptions: {
            compress: {
                drop_console: true, // Remove console.logs in production
                drop_debugger: true,
                pure_funcs: ['console.log', 'console.info', 'console.debug']
            }
        },
        rollupOptions: {
            output: {
                // Manual chunk splitting for better caching
                manualChunks: {
                    'react-vendor': ['react', 'react-dom'],
                    'charts': ['recharts'],
                    'icons': ['lucide-react'],
                    'utils': ['jszip', 'clsx', 'tailwind-merge']
                }
            }
        },
        // Increase chunk size warning limit (optional)
        chunkSizeWarningLimit: 1000,
        // Enable source maps for production debugging (optional, can be disabled to reduce size)
        sourcemap: false
    },
    server: {
        proxy: {
            '/api': {
                target: 'http://localhost:8000',
                changeOrigin: true,
            },
            '/ws': {
                target: 'ws://localhost:8000',
                ws: true,
            }
        }
    }
})
