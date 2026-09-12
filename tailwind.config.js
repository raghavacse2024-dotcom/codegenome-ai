/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#07111F',
        panel: '#0E1D31',
        neon: '#82F6C5',
        mist: '#9EB2C8',
        violet: '#9c8cff',
        cyan: '#5bd8ff',
      },
      borderRadius: {
        none: '0',
        sm: '2px',
        DEFAULT: '4px',
        md: '4px',
        lg: '4px',
        xl: '4px',
        '2xl': '4px',
        '3xl': '4px',
        full: '9999px', // Keeping full for specific circles if needed
      }
    }
  },
  plugins: [],
}
