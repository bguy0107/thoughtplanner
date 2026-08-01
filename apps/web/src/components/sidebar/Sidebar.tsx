'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, PanelLeftClose, Table2, FileText, Search, Settings, FileDown, FileSpreadsheet } from 'lucide-react'
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { signOut, useSession } from '@/lib/auth-client'
import { useSidebarStore, buildPageTree, getDescendantIds } from '@/store/sidebar'
import { api, type PageSummary } from '@/lib/api'
import { positionBetween, resolveInsertPosition } from '@/lib/position'
import { PageTree } from './PageTree'
import { SidebarDragContext, parseZoneId } from './sidebar-dnd'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'
import { SearchModal } from '@/components/SearchModal'
import { NotionImportModal } from '@/components/NotionImportModal'
import { SpreadsheetImportModal } from '@/components/SpreadsheetImportModal'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useWorkspaceStore } from '@/store/workspace'

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const router = useRouter()
  const { data: session } = useSession()
  const { addPage, addDatabase, toggleCollapsed, fetchPages, updatePage, setPages, expandPage } = useSidebarStore()
  const pages = useSidebarStore((s) => s.pages)
  const expandedIds = useSidebarStore((s) => s.expandedIds)
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId)
  const tree = useMemo(() => buildPageTree(pages), [pages])
  const [searchOpen, setSearchOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [spreadsheetImportOpen, setSpreadsheetImportOpen] = useState(false)

  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [invalidTargetIds, setInvalidTargetIds] = useState<Set<string>>(new Set())
  const hoverExpandRef = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null)
  const snapshotRef = useRef<PageSummary[] | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const activePage = activeId ? pages.find((p) => p.id === activeId) ?? null : null

  function clearHoverExpandTimer() {
    if (hoverExpandRef.current) {
      clearTimeout(hoverExpandRef.current.timer)
      hoverExpandRef.current = null
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const id = event.active.id as string
    snapshotRef.current = pages
    setActiveId(id)
    setOverId(null)
    const invalid = getDescendantIds(pages, id)
    invalid.add(id)
    setInvalidTargetIds(invalid)
  }

  function handleDragOver(event: DragOverEvent) {
    const overIdStr = event.over ? String(event.over.id) : null
    setOverId(overIdStr)

    const parsed = overIdStr ? parseZoneId(overIdStr) : null
    if (parsed?.zone === 'inside' && !expandedIds.has(parsed.pageId)) {
      if (hoverExpandRef.current?.id !== parsed.pageId) {
        clearHoverExpandTimer()
        const targetId = parsed.pageId
        hoverExpandRef.current = { id: targetId, timer: setTimeout(() => expandPage(targetId), 600) }
      }
    } else {
      clearHoverExpandTimer()
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    clearHoverExpandTimer()
    setActiveId(null)
    setOverId(null)
    setInvalidTargetIds(new Set())

    const { active, over } = event
    if (!over) return
    const parsed = parseZoneId(String(over.id))
    if (!parsed) return
    const { zone, pageId: targetId } = parsed
    const draggedId = active.id as string
    if (targetId === draggedId) return

    const currentPages = useSidebarStore.getState().pages
    if (getDescendantIds(currentPages, draggedId).has(targetId)) return

    const target = currentPages.find((p) => p.id === targetId)
    if (!target) return

    let newParentPageId: string | null
    let position: number
    // Set when the target gap has no float64 precision left for a distinct
    // midpoint (see resolveInsertPosition) — every listed sibling needs its
    // position persisted, not just the dragged page.
    let rebalanced: { id: string; position: number }[] | undefined

    if (zone === 'inside') {
      newParentPageId = targetId
      const siblings = currentPages
        .filter((p) => p.parentPageId === targetId && p.id !== draggedId)
        .sort((a, b) => a.position - b.position)
      // Open-ended (no "after" neighbor) — always has room, never needs rebalancing.
      position = positionBetween(siblings[siblings.length - 1]?.position, undefined)!
    } else {
      newParentPageId = target.parentPageId
      const siblings = currentPages
        .filter((p) => p.parentPageId === target.parentPageId && p.id !== draggedId)
        .sort((a, b) => a.position - b.position)
        .map((p) => ({ id: p.id, position: p.position }))
      const idx = siblings.findIndex((p) => p.id === targetId)
      const insertIndex = zone === 'before' ? idx : idx + 1
      ;({ position, rebalanced } = resolveInsertPosition(siblings, insertIndex))
    }

    for (const s of rebalanced ?? []) {
      updatePage(s.id, { position: s.position })
    }
    updatePage(draggedId, { parentPageId: newParentPageId, position })
    if (zone === 'inside') expandPage(targetId)

    try {
      await Promise.all([
        ...(rebalanced ?? []).map((s) => api.pages.update(s.id, { position: s.position })),
        api.pages.update(draggedId, { parentPageId: newParentPageId, position }),
      ])
    } catch {
      if (snapshotRef.current) setPages(snapshotRef.current)
    }
  }

  function handleDragCancel() {
    clearHoverExpandTimer()
    setActiveId(null)
    setOverId(null)
    setInvalidTargetIds(new Set())
  }

  async function handleNewPage() {
    if (!currentWorkspaceId) return
    const page = await addPage(currentWorkspaceId)
    router.push(`/page/${page.id}`)
    onClose?.()
  }

  async function handleNewDatabase() {
    if (!currentWorkspaceId) return
    const page = await addDatabase(currentWorkspaceId)
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
        <div className="flex items-center gap-1 px-2 py-2 border-b border-gray-200 dark:border-gray-800">
          <WorkspaceSwitcher accountName={session?.user.name} />
          <button
            onClick={handleCollapse}
            className="flex-shrink-0 p-1 rounded hover:bg-[#ebebea] dark:hover:bg-sidebar-dark-hover text-gray-400 dark:text-sidebar-dark-muted hover:text-gray-600 dark:hover:text-sidebar-dark-text transition-colors"
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
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SidebarDragContext.Provider value={{ overId, invalidTargetIds }}>
              <PageTree parentId={null} depth={0} tree={tree} />
            </SidebarDragContext.Provider>
            <DragOverlay>
              {activePage && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-sm bg-white dark:bg-sidebar-dark-hover shadow-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-sidebar-dark-text">
                  <span className="flex-shrink-0 text-base leading-none">
                    {activePage.icon
                      ? activePage.icon
                      : activePage.isDatabase
                        ? <Table2 size={14} className="text-gray-400 dark:text-sidebar-dark-muted" />
                        : <FileText size={14} className="text-gray-400 dark:text-sidebar-dark-muted" />}
                  </span>
                  <span className="truncate max-w-[160px]">{activePage.title || 'Untitled'}</span>
                </div>
              )}
            </DragOverlay>
          </DndContext>
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
      {importOpen && currentWorkspaceId && (
        <NotionImportModal
          workspaceId={currentWorkspaceId}
          onClose={() => setImportOpen(false)}
          onImported={() => fetchPages(currentWorkspaceId)}
        />
      )}
      {spreadsheetImportOpen && currentWorkspaceId && (
        <SpreadsheetImportModal
          workspaceId={currentWorkspaceId}
          onClose={() => setSpreadsheetImportOpen(false)}
          onImported={(pageId) => {
            fetchPages(currentWorkspaceId)
            router.push(`/page/${pageId}`)
            onClose?.()
          }}
        />
      )}
    </>
  )
}
