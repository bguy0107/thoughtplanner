import { create } from 'zustand'
import { type WorkspaceMembership, type WorkspaceRole, api } from '@/lib/api'

const STORAGE_KEY = 'currentWorkspaceId'

function getStoredWorkspaceId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(STORAGE_KEY)
}

interface WorkspaceStore {
  workspaces: WorkspaceMembership[]
  currentWorkspaceId: string | null
  loading: boolean
  fetchWorkspaces: () => Promise<void>
  switchWorkspace: (id: string) => void
  currentRole: () => WorkspaceRole | null
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspaces: [],
  currentWorkspaceId: getStoredWorkspaceId(),
  loading: false,

  fetchWorkspaces: async () => {
    set({ loading: true })
    try {
      const workspaces = await api.workspaces.list()
      const stored = get().currentWorkspaceId
      const currentWorkspaceId = workspaces.some((w) => w.id === stored) ? stored : (workspaces[0]?.id ?? null)
      if (currentWorkspaceId) localStorage.setItem(STORAGE_KEY, currentWorkspaceId)
      set({ workspaces, currentWorkspaceId, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  switchWorkspace: (id) => {
    localStorage.setItem(STORAGE_KEY, id)
    set({ currentWorkspaceId: id })
  },

  currentRole: () => {
    const { workspaces, currentWorkspaceId } = get()
    return workspaces.find((w) => w.id === currentWorkspaceId)?.role ?? null
  },
}))
