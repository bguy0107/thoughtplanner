'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, PanelLeftClose, Table2, Search, Settings, FileDown, FileSpreadsheet } from 'lucide-react'
import { signOut, useSession } from '@/lib/auth-client'
import { useSidebarStore } from '@/store/sidebar'
import { PageTree } from './PageTree'
import { SearchModal } from '@/components/SearchModal'
import { NotionImportModal } from '@/components/NotionImportModal'
import { SpreadsheetImportModal } from '@/components/SpreadsheetImportModal'
import { ThemeToggle } from '@/components/ThemeToggle'

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const router = useRouter()
  const { data: session } = useSession()
  const { addPage, addDatabase, toggleCollapsed, fetchPages } = useSidebarStore()
  const [searchOpen, setSearchOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [spreadsheetImportOpen, setSpreadsheetImportOpen] = useState(false)

  async function handleNewPage() {
    const page = await addPage()
    router.push(`/page/${page.id}`)
    onClose?.()
  }

  async function handleNewDatabase() {
    const page = await addDatabase()
    router.push(`/page/${page.id}`)
    onClose?.()
  }

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  function handleCollapse() {
    toggleCollapsed()
    onClose?.()
  }

  return (
    <>
      <aside className="w-60 flex-shrink-0 bg-[#f7f7f5] dark:bg-sidebar-dark-bg border-r border-gray-200 dark:border-gray-800 flex flex-col h-full select-none">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-gray-200 dark:border-gray-800">
          <span className="text-sm font-semibold text-gray-700 dark:text-sidebar-dark-text truncate">
            {session?.user.name ?? 'Thoughtplanner'}
          </span>
          <button
            onClick={handleCollapse}
            className="p-1 rounded hover:bg-[#ebebea] dark:hover:bg-sidebar-dark-hover text-gray-400 dark:text-sidebar-dark-muted hover:text-gray-600 dark:hover:text-sidebar-dark-text transition-colors"
            title="Collapse sidebar"
          >
            <PanelLeftClose size={16} />
          </button>
        </div>

        {/* Search */}
        <button
          onClick={() => setSearchOpen(true)}
          className="mx-2 mt-2 flex items-center gap-2 px-2 py-1.5 text-sm text-gray-400 dark:text-sidebar-dark-muted rounded hover:bg-[#ebebea] dark:hover:bg-sidebar-dark-hover transition-colors"
        >
          <Search size={14} />
          <span>Search</span>
          <kbd className="ml-auto text-xs bg-gray-200 dark:bg-sidebar-dark-active text-gray-500 dark:text-sidebar-dark-muted px-1 rounded">⌘K</kbd>
        </button>

        {/* Page tree */}
        <div className="flex-1 overflow-y-auto py-2">
          <PageTree parentId={null} depth={0} />
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-800 p-2 space-y-1">
          <button
            onClick={handleNewPage}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-sidebar-dark-text rounded hover:bg-[#ebebea] dark:hover:bg-sidebar-dark-hover transition-colors"
          >
            <Plus size={15} />
            New page
          </button>
          <button
            onClick={handleNewDatabase}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-sidebar-dark-text rounded hover:bg-[#ebebea] dark:hover:bg-sidebar-dark-hover transition-colors"
          >
            <Table2 size={15} />
            New database
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 dark:text-sidebar-dark-muted rounded hover:bg-[#ebebea] dark:hover:bg-sidebar-dark-hover transition-colors"
          >
            <FileDown size={15} />
            Import from Notion
          </button>
          <button
            onClick={() => setSpreadsheetImportOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 dark:text-sidebar-dark-muted rounded hover:bg-[#ebebea] dark:hover:bg-sidebar-dark-hover transition-colors"
          >
            <FileSpreadsheet size={15} />
            Import spreadsheet
          </button>
          <button
            onClick={() => { router.push('/settings'); onClose?.() }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 dark:text-sidebar-dark-muted rounded hover:bg-[#ebebea] dark:hover:bg-sidebar-dark-hover transition-colors"
          >
            <Settings size={15} />
            Settings
          </button>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 dark:text-sidebar-dark-muted rounded hover:bg-[#ebebea] dark:hover:bg-sidebar-dark-hover transition-colors"
          >
            Sign out
          </button>
          <div className="pt-1 flex justify-center">
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
      {importOpen && (
        <NotionImportModal
          onClose={() => setImportOpen(false)}
          onImported={() => fetchPages()}
        />
      )}
      {spreadsheetImportOpen && (
        <SpreadsheetImportModal
          onClose={() => setSpreadsheetImportOpen(false)}
          onImported={(pageId) => {
            fetchPages()
            router.push(`/page/${pageId}`)
            onClose?.()
          }}
        />
      )}
    </>
  )
}
