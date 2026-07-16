import { create } from 'zustand'
import { type PageSummary, api } from '@/lib/api'

interface SidebarStore {
  pages: PageSummary[]
  loading: boolean
  collapsed: boolean
  fetchPages: () => Promise<void>
  setPages: (pages: PageSummary[]) => void
  addPage: (parentPageId?: string) => Promise<PageSummary>
  addDatabase: (parentPageId?: string) => Promise<PageSummary>
  updatePage: (id: string, data: Partial<PageSummary>) => void
  removePage: (id: string) => void
  toggleCollapsed: () => void
}

export const useSidebarStore = create<SidebarStore>((set, get) => ({
  pages: [],
  loading: false,
  collapsed: false,

  fetchPages: async () => {
    set({ loading: true })
    try {
      const pages = await api.pages.list()
      set({ pages, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  setPages: (pages) => set({ pages }),

  addPage: async (parentPageId) => {
    const page = await api.pages.create({ parentPageId, title: 'Untitled' })
    set((s) => ({ pages: [...s.pages, page] }))
    return page
  },

  addDatabase: async (parentPageId) => {
    const page = await api.pages.create({ parentPageId, title: 'Untitled', isDatabase: true })
    set((s) => ({ pages: [...s.pages, page] }))
    return page
  },

  updatePage: (id, data) =>
    set((s) => ({
      pages: s.pages.map((p) => (p.id === id ? { ...p, ...data } : p)),
    })),

  removePage: (id) =>
    set((s) => ({ pages: s.pages.filter((p) => p.id !== id) })),

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
