'use client'

import { useCallback, useEffect, useState } from 'react'
import { LayoutList, Columns3, LayoutGrid, CalendarDays, Settings2, FileSpreadsheet } from 'lucide-react'
import { api, type Column, type DbSchema, type Page } from '@/lib/api'
import { TableView } from './TableView'
import { BoardView } from './BoardView'
import { GalleryView } from './GalleryView'
import { CalendarView } from './CalendarView'
import { SchemaBuilder } from './SchemaBuilder'
import { SpreadsheetImportModal } from '@/components/SpreadsheetImportModal'
import { LastEditedLabel } from '@/components/LastEditedLabel'

type ViewMode = 'table' | 'board' | 'gallery' | 'calendar'

interface Props {
  page: Page
  onTitleChange: (title: string) => void
}

export function DatabaseView({ page, onTitleChange }: Props) {
  const [schema, setSchema] = useState<DbSchema | null>(null)
  const [view, setView] = useState<ViewMode>('table')
  const [showSchema, setShowSchema] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [meta, setMeta] = useState({ updatedAt: page.updatedAt, updatedBy: page.updatedBy })

  useEffect(() => {
    api.databases.get(page.id).then(setSchema)
  }, [page.id])

  // The page prop only reflects title/icon edits made from this view (see
  // onTitleChange below) — row/schema edits bump the page on the server but
  // don't flow back through props, so those are synced via refreshMeta.
  useEffect(() => {
    setMeta({ updatedAt: page.updatedAt, updatedBy: page.updatedBy })
  }, [page.updatedAt, page.updatedBy])

  const refreshMeta = useCallback(() => {
    api.pages.get(page.id).then((p) => setMeta({ updatedAt: p.updatedAt, updatedBy: p.updatedBy }))
  }, [page.id])

  const handleImported = useCallback(() => {
    setShowImport(false)
    api.databases.get(page.id).then(setSchema)
    refreshMeta()
  }, [page.id, refreshMeta])

  const handleUpdateSchema = useCallback(async (columns: Column[]) => {
    const updated = await api.databases.updateSchema(page.id, columns)
    setSchema((s) => s ? { ...s, columns: updated.columns } : s)
    refreshMeta()
  }, [page.id, refreshMeta])

  const handleAddRow = useCallback(async (properties?: Record<string, unknown>) => {
    const row = await api.databases.createRow(page.id, properties)
    setSchema((s) => s ? { ...s, rows: [...s.rows, row] } : s)
    refreshMeta()
  }, [page.id, refreshMeta])

  const handleUpdateRow = useCallback(async (rowId: string, properties: Record<string, unknown>) => {
    // `properties` here is a partial patch — only the field(s) that changed
    // (see TableView/BoardView/etc). The server merges it server-side and
    // returns the full row, which is what local state must adopt; applying
    // the partial patch directly to local state would drop every other field.
    const updated = await api.databases.updateRow(rowId, properties)
    setSchema((s) => s
      ? { ...s, rows: s.rows.map((r) => r.id === rowId ? updated : r) }
      : s)
    refreshMeta()
  }, [refreshMeta])

  const handleDeleteRow = useCallback(async (rowId: string) => {
    await api.databases.deleteRow(rowId)
    setSchema((s) => s ? { ...s, rows: s.rows.filter((r) => r.id !== rowId) } : s)
    refreshMeta()
  }, [refreshMeta])

  const handleReorderRow = useCallback(async (rowId: string, position: number) => {
    setSchema((s) => {
      if (!s) return s
      const moved = s.rows.find((r) => r.id === rowId)
      if (!moved) return s
      const rest = s.rows.filter((r) => r.id !== rowId)
      const insertAt = rest.findIndex((r) => r.position > position)
      const updated = { ...moved, position }
      const rows = [...rest]
      rows.splice(insertAt === -1 ? rows.length : insertAt, 0, updated)
      return { ...s, rows }
    })
    await api.databases.reorderRow(rowId, position)
  }, [])

  const views: { mode: ViewMode; label: string; icon: React.ReactNode }[] = [
    { mode: 'table', label: 'Table', icon: <LayoutList size={14} /> },
    { mode: 'board', label: 'Board', icon: <Columns3 size={14} /> },
    { mode: 'gallery', label: 'Gallery', icon: <LayoutGrid size={14} /> },
    { mode: 'calendar', label: 'Calendar', icon: <CalendarDays size={14} /> },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-8 pt-10 pb-0 flex-shrink-0">
        <div className="max-w-5xl mx-auto">
          {page.icon && <div className="text-5xl mb-3">{page.icon}</div>}
          <div className="flex items-end gap-3 mb-4">
            <input
              key={page.id}
              defaultValue={page.title}
              placeholder="Untitled"
              onBlur={(e) => onTitleChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
              className="flex-1 min-w-0 text-4xl font-bold text-gray-900 dark:text-gray-100 outline-none placeholder-gray-300 dark:placeholder-gray-600 bg-transparent"
            />
            <LastEditedLabel updatedAt={meta.updatedAt} updatedBy={meta.updatedBy} />
          </div>

          {/* View tabs + properties toggle */}
          <div className="flex items-center gap-0.5 border-b border-gray-200 dark:border-gray-800 pb-0">
            {views.map((v) => (
              <button
                key={v.mode}
                onClick={() => setView(v.mode)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-t transition-colors -mb-px border-b-2 ${
                  view === v.mode
                    ? 'text-gray-900 dark:text-gray-100 font-medium border-gray-900 dark:border-gray-100'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border-transparent'
                }`}
              >
                {v.icon}
                {v.label}
              </button>
            ))}
            <div className="flex-1" />
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded transition-colors mb-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <FileSpreadsheet size={14} />
              Import
            </button>
            <button
              onClick={() => setShowSchema((s) => !s)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded transition-colors mb-1 ${
                showSchema
                  ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <Settings2 size={14} />
              Properties
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto px-8 py-6">
          <div className="max-w-5xl mx-auto">
            {!schema ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-600 border-t-gray-600 dark:border-t-gray-300 rounded-full animate-spin" />
              </div>
            ) : view === 'table' ? (
              <TableView
                schema={schema}
                onUpdateRow={handleUpdateRow}
                onDeleteRow={handleDeleteRow}
                onAddRow={handleAddRow}
                onUpdateSchema={handleUpdateSchema}
                onReorderRow={handleReorderRow}
              />
            ) : view === 'board' ? (
              <BoardView
                schema={schema}
                onUpdateRow={handleUpdateRow}
                onDeleteRow={handleDeleteRow}
                onAddRow={handleAddRow}
              />
            ) : view === 'gallery' ? (
              <GalleryView
                schema={schema}
                onUpdateRow={handleUpdateRow}
                onDeleteRow={handleDeleteRow}
                onAddRow={handleAddRow}
              />
            ) : (
              <CalendarView
                schema={schema}
                onUpdateRow={handleUpdateRow}
                onDeleteRow={handleDeleteRow}
                onAddRow={handleAddRow}
              />
            )}
          </div>
        </div>

        {showSchema && schema && (
          <SchemaBuilder
            schema={schema}
            onUpdate={handleUpdateSchema}
            onUpdateRow={handleUpdateRow}
            onClose={() => setShowSchema(false)}
          />
        )}
      </div>

      {showImport && (
        <SpreadsheetImportModal
          targetPageId={page.id}
          onClose={() => setShowImport(false)}
          onImported={handleImported}
        />
      )}
    </div>
  )
}
