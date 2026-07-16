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

  useEffect(() => {
    api.databases.get(page.id).then(setSchema)
  }, [page.id])

  const handleImported = useCallback(() => {
    setShowImport(false)
    api.databases.get(page.id).then(setSchema)
  }, [page.id])

  const handleUpdateSchema = useCallback(async (columns: Column[]) => {
    const updated = await api.databases.updateSchema(page.id, columns)
    setSchema((s) => s ? { ...s, columns: updated.columns } : s)
  }, [page.id])

  const handleAddRow = useCallback(async (properties?: Record<string, unknown>) => {
    const row = await api.databases.createRow(page.id, properties)
    setSchema((s) => s ? { ...s, rows: [...s.rows, row] } : s)
  }, [page.id])

  const handleUpdateRow = useCallback(async (rowId: string, properties: Record<string, unknown>) => {
    await api.databases.updateRow(rowId, properties)
    setSchema((s) => s
      ? { ...s, rows: s.rows.map((r) => r.id === rowId ? { ...r, properties } : r) }
      : s)
  }, [])

  const handleDeleteRow = useCallback(async (rowId: string) => {
    await api.databases.deleteRow(rowId)
    setSchema((s) => s ? { ...s, rows: s.rows.filter((r) => r.id !== rowId) } : s)
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
          <input
            key={page.id}
            defaultValue={page.title}
            placeholder="Untitled"
            onBlur={(e) => onTitleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            className="w-full text-4xl font-bold text-gray-900 outline-none placeholder-gray-300 mb-4 bg-transparent"
          />

          {/* View tabs + properties toggle */}
          <div className="flex items-center gap-0.5 border-b border-gray-200 pb-0">
            {views.map((v) => (
              <button
                key={v.mode}
                onClick={() => setView(v.mode)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-t transition-colors -mb-px border-b-2 ${
                  view === v.mode
                    ? 'text-gray-900 font-medium border-gray-900'
                    : 'text-gray-500 hover:text-gray-700 border-transparent'
                }`}
              >
                {v.icon}
                {v.label}
              </button>
            ))}
            <div className="flex-1" />
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded transition-colors mb-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            >
              <FileSpreadsheet size={14} />
              Import
            </button>
            <button
              onClick={() => setShowSchema((s) => !s)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded transition-colors mb-1 ${
                showSchema
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
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
                <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
              </div>
            ) : view === 'table' ? (
              <TableView
                schema={schema}
                onUpdateRow={handleUpdateRow}
                onDeleteRow={handleDeleteRow}
                onAddRow={handleAddRow}
                onUpdateSchema={handleUpdateSchema}
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
