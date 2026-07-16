import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Thoughtplanner',
  description: 'Your self-hosted workspace',
}

// Runs before hydration so the correct theme class is present for first paint.
const themeInitScript = `(function(){try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-white text-gray-900 dark:bg-[#191919] dark:text-gray-100 antialiased">
        {children}
      </body>
    </html>
  )
}
