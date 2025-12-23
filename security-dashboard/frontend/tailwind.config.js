/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // Professional neutral palette for light theme
                slate: {
                    50: '#f8fafc',
                    75: '#f4f7fc',
                    100: '#f1f5f9',
                    150: '#eef2f8',
                    200: '#e2e8f0',
                    300: '#cbd5e1',
                    400: '#94a3b8',
                    500: '#64748b',
                    600: '#475569',
                    700: '#334155',
                    800: '#1e293b',
                    900: '#0f172a',
                },
                // Premium accent colors
                azure: {
                    50: '#f0f9ff',
                    100: '#e0f2fe',
                    200: '#bae6fd',
                    300: '#7dd3fc',
                    400: '#38bdf8',
                    500: '#0ea5e9',
                    600: '#0284c7',
                    700: '#0369a1',
                    800: '#075985',
                    900: '#0c3d66',
                },
            },
            fontFamily: {
                sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Helvetica', 'Arial', 'sans-serif'],
                display: ['Rethink Sans', 'Inter', 'sans-serif'],
                mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
            },
            fontSize: {
                xs: ['0.75rem', { lineHeight: '1rem' }],
                sm: ['0.875rem', { lineHeight: '1.25rem' }],
                base: ['1rem', { lineHeight: '1.5rem' }],
                lg: ['1.125rem', { lineHeight: '1.75rem' }],
                xl: ['1.25rem', { lineHeight: '1.75rem' }],
                '2xl': ['1.5rem', { lineHeight: '2rem' }],
                '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
            },
            fontWeight: {
                light: '300',
                normal: '400',
                medium: '500',
                semibold: '600',
                bold: '700',
                extrabold: '800',
            },
            boxShadow: {
                // Light theme shadows - subtle and professional
                xs: '0 1px 2px 0 rgba(15, 23, 42, 0.05)',
                sm: '0 1px 3px 0 rgba(15, 23, 42, 0.08), 0 1px 2px 0 rgba(15, 23, 42, 0.04)',
                base: '0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -1px rgba(15, 23, 42, 0.04)',
                md: '0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -2px rgba(15, 23, 42, 0.04)',
                lg: '0 20px 25px -5px rgba(15, 23, 42, 0.08), 0 10px 10px -5px rgba(15, 23, 42, 0.04)',
                xl: '0 25px 50px -12px rgba(15, 23, 42, 0.1)',
                '2xl': '0 25px 50px -12px rgba(15, 23, 42, 0.15)',
                glow: '0 0 20px rgba(14, 165, 233, 0.15)',
                'glow-md': '0 0 40px rgba(14, 165, 233, 0.25)',
            },
            borderRadius: {
                none: '0',
                xs: '0.25rem',
                sm: '0.375rem',
                base: '0.5rem',
                md: '0.75rem',
                lg: '1rem',
                xl: '1.25rem',
                '2xl': '1.5rem',
                '3xl': '2rem',
            },
            backdropBlur: {
                xs: 'blur(2px)',
                sm: 'blur(4px)',
                base: 'blur(8px)',
                md: 'blur(12px)',
                lg: 'blur(16px)',
            },
            backgroundImage: {
                'gradient-light': 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                'gradient-subtle': 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                'gradient-blue': 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
            },
            transitionDuration: {
                '2000': '2000ms',
                '3000': '3000ms',
            },
        },
    },
    plugins: [],
}
