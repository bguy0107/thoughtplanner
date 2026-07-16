'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Menu, Search } from 'lucide-react'
import { useSession } from '@/lib/auth-client'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { SearchModal } from '@/components/SearchModal'
import { useSidebarStore } from '@/store/sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession()
  const router = useRouter()
  const { collapsed, fetchPages } = useSidebarStore()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    if (!isPending && !session) router.push('/login')
  }, [session, isPending, router])

  useEffect(() => {
    if (session) fetchPages()
  }, [session, fetchPages])

  // Ctrl+K / Cmd+K global shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const closeMobile = useCallback(() => setMobileOpen(false), [])

  if (isPending || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f7f5]">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      {!collapsed && (
        <div className="hidden md:flex">
          <Sidebar />
        </div>
      )}

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden flex">
          <div className="absolute inset-0 bg-black/30" onClick={closeMobile} />
          <div className="relative z-50 flex">
            <Sidebar onClose={closeMobile} />
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-y-auto flex flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 md:hidden bg-[#f7f7f5]">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded hover:bg-[#ebebea] text-gray-500"
          >
            <Menu size={18} />
          </button>
          <span className="text-sm font-semibold text-gray-700 flex-1 truncate">
            Thoughtplanner
          </span>
          <button
            onClick={() => setSearchOpen(true)}
            className="p-1.5 rounded hover:bg-[#ebebea] text-gray-500"
          >
            <Search size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>

      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
    </div>
  )
}
