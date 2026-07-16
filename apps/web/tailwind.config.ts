import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Notion-inspired neutral palette
        sidebar: {
          bg: '#f7f7f5',
          hover: '#ebebea',
          active: '#e3e2e0',
          text: '#37352f',
          muted: '#9b9a97',
        },
        // Dark-mode counterpart, same roles
        'sidebar-dark': {
          bg: '#202020',
          hover: '#2a2a2a',
          active: '#333333',
          text: '#e3e2e0',
          muted: '#8a8987',
        },
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}

export default config
