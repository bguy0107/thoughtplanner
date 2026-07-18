const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error ?? 'Request failed')
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export type PageSummary = {
  id: string
  workspaceId: string
  parentPageId: string | null
  title: string
  icon: string | null
  isDatabase: boolean
  position: number
  updatedAt: string
}

export type WorkspaceRole = 'ADMIN' | 'EDITOR' | 'VIEWER'

export type Workspace = {
  id: string
  name: string
  icon: string | null
  createdAt: string
}

export type WorkspaceMembership = Workspace & { role: WorkspaceRole }

export type WorkspaceMember = {
  id: string
  userId: string
  role: WorkspaceRole
  createdAt: string
  user: { id: string; name: string; email: string; image: string | null }
}

export type Page = PageSummary & {
  coverImage: string | null
  content: unknown
  isArchived: boolean
  isPublic: boolean
  createdById: string
  updatedById: string
  createdAt: string
  files: FileRecord[]
}

export type FileRecord = {
  id: string
  pageId: string
  filename: string
  mimeType: string
  size: number
  storageKey: string
  url: string
  createdAt: string
}

export type ColumnType = 'text' | 'number' | 'checkbox' | 'date' | 'select' | 'multi_select' | 'relation' | 'rollup'

export type RollupOperation = 'count' | 'sum' | 'avg' | 'min' | 'max'

export type Column = {
  id: string
  name: string
  type: ColumnType
  options?: string[]          // select / multi_select
  targetPageId?: string       // relation: database page to link to
  relationColId?: string      // rollup: which relation col to follow
  targetColId?: string        // rollup: column in target db to aggregate
  operation?: RollupOperation // rollup
}

export type RelatedRow = { id: string; displayName: string }

export type DbRow = {
  id: string
  pageId: string
  schemaId: string
  properties: Record<string, unknown>
  position: number
}

export type DbSchema = {
  id: string
  pageId: string
  columns: Column[]
  rows: DbRow[]
}

export type SearchResult = {
  id: string
  title: string
  icon: string | null
  isDatabase: boolean
}

export type ApiKey = {
  id: string
  name: string
  prefix: string
  createdAt: string
  lastUsed: string | null
}

export type ApiKeyCreated = ApiKey & { key: string }

export type UserRole = 'ADMIN' | 'EDITOR' | 'VIEWER'

export type Invite = {
  id: string
  email: string
  role: UserRole
  token: string
  createdAt: string
  usedAt: string | null
  createdBy: { name: string }
  usedBy: { name: string } | null
}

export type InviteCreated = {
  id: string
  email: string
  role: UserRole
  token: string
  createdAt: string
}

export type AdminPage = {
  id: string
  workspaceId: string
  workspace: { name: string }
  parentPageId: string | null
  title: string
  icon: string | null
  isDatabase: boolean
  isArchived: boolean
  isPublic: boolean
  updatedAt: string
  createdBy: { id: string; name: string }
  updatedBy: { id: string; name: string }
}

export type AdminDatabase = {
  id: string
  workspaceId: string
  workspaceName: string
  title: string
  icon: string | null
  isArchived: boolean
  updatedAt: string
  createdBy: { id: string; name: string }
  columnCount: number
  rowCount: number
}

export const api = {
  pages: {
    list: (workspaceId?: string) =>
      request<PageSummary[]>(`/api/pages${workspaceId ? `?workspaceId=${workspaceId}` : ''}`),
    get: (id: string) => request<Page>(`/api/pages/${id}`),
    getPublic: (id: string) => request<Pick<Page, 'id' | 'title' | 'icon' | 'coverImage' | 'content' | 'isPublic' | 'isDatabase'>>(`/api/public/${id}`),
    create: (data: { workspaceId: string; parentPageId?: string; title?: string; icon?: string; isDatabase?: boolean }) =>
      request<Page>('/api/pages', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Pick<Page, 'title' | 'icon' | 'coverImage' | 'content' | 'isArchived' | 'isPublic' | 'position' | 'parentPageId'>>) =>
      request<Page>(`/api/pages/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/api/pages/${id}`, { method: 'DELETE' }),
  },
  databases: {
    get: (pageId: string) => request<DbSchema>(`/api/databases/${pageId}`),
    updateSchema: (pageId: string, columns: Column[]) =>
      request<{ id: string; pageId: string; columns: Column[] }>(
        `/api/databases/${pageId}/schema`,
        { method: 'PATCH', body: JSON.stringify({ columns }) },
      ),
    createRow: (pageId: string, properties: Record<string, unknown> = {}) =>
      request<DbRow>(`/api/databases/${pageId}/rows`, {
        method: 'POST',
        body: JSON.stringify({ properties }),
      }),
    updateRow: (rowId: string, properties: Record<string, unknown>) =>
      request<DbRow>(`/api/databases/rows/${rowId}`, {
        method: 'PATCH',
        body: JSON.stringify({ properties }),
      }),
    reorderRow: (rowId: string, position: number) =>
      request<DbRow>(`/api/databases/rows/${rowId}`, {
        method: 'PATCH',
        body: JSON.stringify({ position }),
      }),
    deleteRow: (rowId: string) =>
      request<void>(`/api/databases/rows/${rowId}`, { method: 'DELETE' }),
    relatedRows: (pageId: string, ids: string[]) =>
      request<RelatedRow[]>(`/api/databases/${pageId}/related-rows?ids=${ids.join(',')}`),
  },
  files: {
    list: (pageId: string) => request<FileRecord[]>(`/api/pages/${pageId}/files`),
    upload: async (pageId: string, file: File): Promise<FileRecord> => {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${API}/api/pages/${pageId}/files`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      })
      if (!res.ok) throw new Error('Upload failed')
      return res.json()
    },
    delete: (id: string) => request<void>(`/api/files/${id}`, { method: 'DELETE' }),
  },
  search: (q: string, workspaceId: string) =>
    request<SearchResult[]>(`/api/search?q=${encodeURIComponent(q)}&workspaceId=${workspaceId}`),
  apiKeys: {
    list: () => request<ApiKey[]>('/api/api-keys'),
    create: (name: string) => request<ApiKeyCreated>('/api/api-keys', { method: 'POST', body: JSON.stringify({ name }) }),
    delete: (id: string) => request<void>(`/api/api-keys/${id}`, { method: 'DELETE' }),
  },
  invites: {
    list: () => request<Invite[]>('/api/admin/invites'),
    create: (email: string, role: UserRole) =>
      request<InviteCreated>('/api/admin/invites', { method: 'POST', body: JSON.stringify({ email, role }) }),
    delete: (id: string) => request<void>(`/api/admin/invites/${id}`, { method: 'DELETE' }),
    lookup: (token: string) => request<{ email: string; role: UserRole }>(`/api/invites/${token}`),
  },
  admin: {
    pages: {
      list: () => request<AdminPage[]>('/api/admin/pages'),
      restore: (id: string) => request<void>(`/api/admin/pages/${id}/restore`, { method: 'POST' }),
      purge: (id: string) => request<void>(`/api/admin/pages/${id}/purge`, { method: 'DELETE' }),
    },
    databases: {
      list: () => request<AdminDatabase[]>('/api/admin/databases'),
    },
  },
  workspaces: {
    list: () => request<WorkspaceMembership[]>('/api/workspaces'),
    create: (data: { name: string; icon?: string }) =>
      request<WorkspaceMembership>('/api/workspaces', { method: 'POST', body: JSON.stringify(data) }),
    get: (id: string) => request<WorkspaceMembership>(`/api/workspaces/${id}`),
    update: (id: string, data: { name?: string; icon?: string | null }) =>
      request<Workspace>(`/api/workspaces/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/api/workspaces/${id}`, { method: 'DELETE' }),
    members: {
      list: (workspaceId: string) => request<WorkspaceMember[]>(`/api/workspaces/${workspaceId}/members`),
      add: (workspaceId: string, data: { email: string; role: WorkspaceRole }) =>
        request<WorkspaceMember>(`/api/workspaces/${workspaceId}/members`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      setRole: (workspaceId: string, memberId: string, role: WorkspaceRole) =>
        request<WorkspaceMember>(`/api/workspaces/${workspaceId}/members/${memberId}`, {
          method: 'PATCH',
          body: JSON.stringify({ role }),
        }),
      remove: (workspaceId: string, memberId: string) =>
        request<void>(`/api/workspaces/${workspaceId}/members/${memberId}`, { method: 'DELETE' }),
    },
  },
}
