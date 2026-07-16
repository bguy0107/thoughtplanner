import type { Config } from 'tailwindcss'

const config: Config = {
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
