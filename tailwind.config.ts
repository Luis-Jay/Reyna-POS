import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#e6f2ff',
          100: '#bddeff',
          200: '#90c8ff',
          300: '#60b0ff',
          400: '#399dff',
          500: '#1a8eff',  // brand blue (matches screenshots)
          600: '#0077e6',
          700: '#005fba',
          800: '#004890',
          900: '#003268',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
