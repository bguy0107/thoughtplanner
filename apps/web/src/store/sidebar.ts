import { create } from 'zustand'
import { type PageSummary, api } from '@/lib/api'

interface SidebarStore {
  pages: PageSummary[]
  loading: boolean
  collapsed: boolean
  expandedIds: Set<string>
  fetchPages: (workspaceId?: string) => Promise<void>
  setPages: (pages: PageSummary[]) => void
  addPage: (workspaceId: string, parentPageId?: string) => Promise<PageSummary>
  addDatabase: (workspaceId: string, parentPageId?: string) => Promise<PageSummary>
  addFolder: (workspaceId: string, parentPageId?: string) => Promise<PageSummary>
  updatePage: (id: string, data: Partial<PageSummary>) => void
  removePage: (id: string) => void
  toggleCollapsed: () => void
  expandPage: (id: string) => void
  toggleExpanded: (id: string) => void
}

export const useSidebarStore = create<SidebarStore>((set, get) => ({
  pages: [],
  loading: false,
  collapsed: false,
  expandedIds: new Set(),

  fetchPages: async (workspaceId) => {
    if (!workspaceId) { set({ pages: [] }); return }
    set({ loading: true })
    try {
      const pages = await api.pages.list(workspaceId)
      set({ pages, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  setPages: (pages) => set({ pages }),

  addPage: async (workspaceId, parentPageId) => {
    const page = await api.pages.create({ workspaceId, parentPageId, title: 'Untitled' })
    set((s) => ({ pages: [...s.pages, page] }))
    return page
  },

  addDatabase: async (workspaceId, parentPageId) => {
    const page = await api.pages.create({ workspaceId, parentPageId, title: 'Untitled', isDatabase: true })
    set((s) => ({ pages: [...s.pages, page] }))
    return page
  },

  addFolder: async (workspaceId, parentPageId) => {
    const page = await api.pages.create({ workspaceId, parentPageId, title: 'New folder', isFolder: true })
    set((s) => ({ pages: [...s.pages, page] }))
    return page
  },

  updatePage: (id, data) =>
    set((s) => ({
      pages: s.pages.map((p) => (p.id === id ? { ...p, ...data } : p)),
    })),

  removePage: (id) =>
    set((s) => {
      // The server cascades archival to descendants too, so drop them from local
      // state as well — otherwise they'd linger, unreachable, under a removed parent.
      const toRemove = new Set([id, ...getDescendantIds(s.pages, id)])
      return { pages: s.pages.filter((p) => !toRemove.has(p.id)) }
    }),

  toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),

  expandPage: (id) =>
    set((s) => (s.expandedIds.has(id) ? s : { expandedIds: new Set(s.expandedIds).add(id) })),

  toggleExpanded: (id) =>
    set((s) => {
      const next = new Set(s.expandedIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { expandedIds: next }
    }),
}))

// Derive a tree structure from the flat page list
export function buildPageTree(pages: PageSummary[]) {
  const map = new Map<string | null, PageSummary[]>()
  for (const p of pages) {
    const key = p.parentPageId ?? null
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(p)
  }
  return map
}

// All ids nested (at any depth) under `id`, used to keep drag-and-drop from
// nesting a page inside its own subtree and to cascade local removal.
export function getDescendantIds(pages: PageSummary[], id: string): Set<string> {
  const result = new Set<string>()
  let grew = true
  while (grew) {
    grew = false
    for (const p of pages) {
      if (p.parentPageId && (p.parentPageId === id || result.has(p.parentPageId)) && !result.has(p.id)) {
        result.add(p.id)
        grew = true
      }
    }
  }
  return result
}
