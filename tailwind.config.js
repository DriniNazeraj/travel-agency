/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#EDE6D9',
        surface: '#F8F4EC',
        'surface-2': '#E8E0D2',
        ink: '#1B1914',
        'ink-muted': '#5E574C',
        pine: '#1F3D32',
        'pine-mid': '#2F5A48',
        moss: '#4E6B4A',
        clay: '#A8441E',
        'clay-deep': '#9A3D1A',
        sand: '#C9B896',
        line: '#D4CBBA',
        focus: '#1F3D32',
        danger: '#9B2C1A',
      },
      fontFamily: {
        display: ['Fraunces', '"Source Serif 4"', 'Georgia', 'serif'],
        sans: ['"Source Sans 3"', '"Source Sans Pro"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 8px 24px rgba(27, 25, 20, 0.08)',
        sheet: '0 -8px 32px rgba(27, 25, 20, 0.12)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}
