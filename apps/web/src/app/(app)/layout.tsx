'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Menu, Search } from 'lucide-react'
import { useSession } from '@/lib/auth-client'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { SearchModal } from '@/components/SearchModal'
import { useSidebarStore } from '@/store/sidebar'
import { useWorkspaceStore } from '@/store/workspace'
import { CreateWorkspaceModal } from '@/components/sidebar/CreateWorkspaceModal'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession()
  const router = useRouter()
  const { collapsed, fetchPages } = useSidebarStore()
  const { workspaces, currentWorkspaceId, loading: workspacesLoading, fetchWorkspaces } = useWorkspaceStore()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false)

  useEffect(() => {
    if (!isPending && !session) router.push('/login')
  }, [session, isPending, router])

  useEffect(() => {
    if (session) fetchWorkspaces()
  }, [session, fetchWorkspaces])

  useEffect(() => {
    if (currentWorkspaceId) fetchPages(currentWorkspaceId)
  }, [currentWorkspaceId, fetchPages])

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
      <div className="min-h-screen flex items-center justify-center bg-[#f7f7f5] dark:bg-sidebar-dark-bg">
        <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-600 border-t-gray-700 dark:border-t-gray-300 rounded-full animate-spin" />
      </div>
    )
  }

  if (!workspacesLoading && workspaces.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f7f5] dark:bg-sidebar-dark-bg px-4">
        <div className="text-center max-w-sm">
          <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">No workspaces yet</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
            You aren&apos;t a member of any workspace. Create one to get started, or ask an admin to add you to theirs.
          </p>
          <button
            onClick={() => setCreateWorkspaceOpen(true)}
            className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300 transition-colors"
          >
            Create a workspace
          </button>
        </div>
        {createWorkspaceOpen && (
          <CreateWorkspaceModal
            onClose={() => setCreateWorkspaceOpen(false)}
            onCreated={() => fetchWorkspaces()}
          />
        )}
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
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-800 md:hidden bg-[#f7f7f5] dark:bg-sidebar-dark-bg">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded hover:bg-[#ebebea] dark:hover:bg-sidebar-dark-hover text-gray-500 dark:text-sidebar-dark-muted"
          >
            <Menu size={18} />
          </button>
          <span className="text-sm font-semibold text-gray-700 dark:text-sidebar-dark-text flex-1 truncate">
            Thoughtplanner
          </span>
          <button
            onClick={() => setSearchOpen(true)}
            className="p-1.5 rounded hover:bg-[#ebebea] dark:hover:bg-sidebar-dark-hover text-gray-500 dark:text-sidebar-dark-muted"
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
