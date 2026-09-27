/** @type {import('tailwindcss').Config} */

// Warm neutral ramp shared by `gray` and `slate`, so every existing
// gray-*/slate-* class (light and dark: variants) lands on the console palette.
const neutral = {
    50: '#F6F7F9',
    75: '#F2F4F6',
    100: '#EEF0F3',
    150: '#E8EBEF',
    200: '#E1E4E8',
    300: '#CDD2D9',
    400: '#A5A7AB',
    500: '#6E7277',
    600: '#5A5E63',
    700: '#3A3D43',
    800: '#2B2D32',
    900: '#232529',
    950: '#0A0A0B',
};

// One muted accent blue for `azure` and `blue`.
const accent = {
    50: '#EEF2F8',
    100: '#E3E8EF',
    200: '#C9D5E6',
    300: '#9FB4D3',
    400: '#7FA8E4',
    500: '#4F7FC0',
    600: '#1F4E8C',
    700: '#163A69',
    800: '#0F2C52',
    900: '#0B1F3A',
    950: '#08162A',
};

// Severity colours, toned down to read as ink rather than neon.
const red = { 50: '#FBEEEE', 100: '#F7E1E1', 200: '#EBC3C3', 300: '#E0A0A0', 400: '#E58C8C', 500: '#C23B3B', 600: '#A92626', 700: '#9B1C1C', 800: '#7A1616', 900: '#4A1212', 950: '#2E0B0B' };
const orange = { 50: '#FAEEE3', 100: '#F5E0CC', 200: '#EBC6A5', 300: '#DDA377', 400: '#E0955A', 500: '#C0621F', 600: '#A8541A', 700: '#8A3F0F', 800: '#6B310C', 900: '#45200A', 950: '#2B1406' };
const amber = { 50: '#FBF6E6', 100: '#F6ECD3', 200: '#E8D39A', 300: '#D9BA6A', 400: '#E3B866', 500: '#C9A227', 600: '#A67C12', 700: '#8A5A00', 800: '#6B4600', 900: '#443000', 950: '#2A1E00' };
const green = { 50: '#EEF5EF', 100: '#DCEBDF', 200: '#C4DEC9', 300: '#9CC5A5', 400: '#8CC49A', 500: '#4E8A5B', 600: '#3B7547', 700: '#2F6B3A', 800: '#24532D', 900: '#17361D', 950: '#0E2212' };

export default {
    darkMode: 'class',
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                gray: neutral,
                slate: neutral,
                azure: accent,
                blue: accent,
                red,
                orange,
                amber,
                yellow: amber,
                green,
                emerald: green,
            },
            fontFamily: {
                sans: ['Montserrat', '"Segoe UI"', 'system-ui', 'sans-serif'],
                serif: ['Montserrat', '"Segoe UI"', 'system-ui', 'sans-serif'],
                display: ['Montserrat', '"Segoe UI"', 'system-ui', 'sans-serif'],
                mono: ['"Fira Code"', 'ui-monospace', 'Consolas', 'monospace'],
            },
            // Small, deliberate corners everywhere; `full` stays for dots.
            borderRadius: {
                none: '0',
                xs: '2px',
                sm: '3px',
                DEFAULT: '3px',
                base: '4px',
                md: '5px',
                lg: '5px',
                xl: '6px',
                '2xl': '6px',
                '3xl': '6px',
            },
            // Depth comes from borders and fills, not shadows.
            boxShadow: {
                xs: 'none',
                sm: 'none',
                DEFAULT: 'none',
                base: 'none',
                md: 'none',
                lg: '0 4px 12px rgba(27, 29, 31, 0.10)',
                xl: '0 8px 24px rgba(27, 29, 31, 0.12)',
                '2xl': '0 8px 24px rgba(27, 29, 31, 0.14)',
                glow: 'none',
                'glow-md': 'none',
            },
        },
    },
    plugins: [],
}
