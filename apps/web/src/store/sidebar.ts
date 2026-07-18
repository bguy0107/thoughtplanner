import { create } from 'zustand'
import { type PageSummary, api } from '@/lib/api'

interface SidebarStore {
  pages: PageSummary[]
  loading: boolean
  collapsed: boolean
  fetchPages: (workspaceId?: string) => Promise<void>
  setPages: (pages: PageSummary[]) => void
  addPage: (workspaceId: string, parentPageId?: string) => Promise<PageSummary>
  addDatabase: (workspaceId: string, parentPageId?: string) => Promise<PageSummary>
  updatePage: (id: string, data: Partial<PageSummary>) => void
  removePage: (id: string) => void
  toggleCollapsed: () => void
}

export const useSidebarStore = create<SidebarStore>((set, get) => ({
  pages: [],
  loading: false,
  collapsed: false,

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

  updatePage: (id, data) =>
    set((s) => ({
      pages: s.pages.map((p) => (p.id === id ? { ...p, ...data } : p)),
    })),

  removePage: (id) =>
    set((s) => {
      // The server cascades archival to descendants too, so drop them from local
      // state as well — otherwise they'd linger, unreachable, under a removed parent.
      const toRemove = new Set([id])
      let grew = true
      while (grew) {
        grew = false
        for (const p of s.pages) {
          if (p.parentPageId && toRemove.has(p.parentPageId) && !toRemove.has(p.id)) {
            toRemove.add(p.id)
            grew = true
          }
        }
      }
      return { pages: s.pages.filter((p) => !toRemove.has(p.id)) }
    }),

  toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
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
