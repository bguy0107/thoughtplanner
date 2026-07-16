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
  parentPageId: string | null
  title: string
  icon: string | null
  isDatabase: boolean
  position: number
  updatedAt: string
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

export const api = {
  pages: {
    list: () => request<PageSummary[]>('/api/pages'),
    get: (id: string) => request<Page>(`/api/pages/${id}`),
    getPublic: (id: string) => request<Pick<Page, 'id' | 'title' | 'icon' | 'coverImage' | 'content' | 'isPublic' | 'isDatabase'>>(`/api/public/${id}`),
    create: (data: { parentPageId?: string; title?: string; icon?: string; isDatabase?: boolean }) =>
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
  search: (q: string) => request<SearchResult[]>(`/api/search?q=${encodeURIComponent(q)}`),
  apiKeys: {
    list: () => request<ApiKey[]>('/api/api-keys'),
    create: (name: string) => request<ApiKeyCreated>('/api/api-keys', { method: 'POST', body: JSON.stringify({ name }) }),
    delete: (id: string) => request<void>(`/api/api-keys/${id}`, { method: 'DELETE' }),
  },
}
