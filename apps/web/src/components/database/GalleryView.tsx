'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { DbRow, DbSchema } from '@/lib/api'
import { chipColor } from './TableView'

function getProp(row: DbRow, colId: string): unknown {
  return (row.properties as Record<string, unknown>)[colId] ?? null
}

interface Props {
  schema: DbSchema
  onUpdateRow: (rowId: string, props: Record<string, unknown>) => void
  onDeleteRow: (rowId: string) => void
  onAddRow: (props?: Record<string, unknown>) => void
}

interface GalleryCardProps {
  row: DbRow
  schema: DbSchema
  onDelete: () => void
  onEditName: (rowId: string, name: string) => void
}

function GalleryCard({ row, schema, onDelete, onEditName }: GalleryCardProps) {
  const [editing, setEditing] = useState(false)
  const nameCol = schema.columns[0]
  const name = nameCol ? ((getProp(row, nameCol.id) as string | null) ?? '') : ''
  const extraCols = schema.columns.slice(1)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 group hover:shadow-sm transition-shadow flex flex-col gap-2">
      {/* Title */}
      <div className="flex items-start gap-2">
        {editing ? (
          <input
            autoFocus
            defaultValue={name}
            className="flex-1 font-medium text-gray-900 dark:text-gray-100 outline-none border-b border-blue-300 bg-transparent"
            onBlur={(e) => { onEditName(row.id, e.target.value); setEditing(false) }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          />
        ) : (
          <span
            className="flex-1 font-medium text-gray-900 dark:text-gray-100 cursor-text"
            onClick={() => setEditing(true)}
          >
            {name || <span className="text-gray-300 dark:text-gray-600 font-normal">Untitled</span>}
          </span>
        )}
        <button
          onClick={onDelete}
          className="p-0.5 rounded text-transparent group-hover:text-gray-300 dark:group-hover:text-gray-600 hover:!text-red-500 transition-colors flex-shrink-0"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Properties */}
      {extraCols.map((col) => {
        const val = getProp(row, col.id)
        if (val == null || val === '' || (Array.isArray(val) && val.length === 0)) return null
        return (
          <div key={col.id} className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">{col.name}</span>
            {col.type === 'checkbox' ? (
              <span className={`text-xs px-1.5 py-0.5 rounded ${val ? 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                {val ? 'Yes' : 'No'}
              </span>
            ) : col.type === 'select' ? (
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${chipColor(col.options ?? [], val as string)}`}>
                {val as string}
              </span>
            ) : col.type === 'multi_select' && Array.isArray(val) ? (
              <div className="flex flex-wrap gap-1">
                {(val as string[]).map((opt) => (
                  <span key={opt} className={`text-xs px-2 py-0.5 rounded font-medium ${chipColor(col.options ?? [], opt)}`}>{opt}</span>
                ))}
              </div>
            ) : (
              <span className="text-xs text-gray-600 dark:text-gray-300">{String(val)}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function GalleryView({ schema, onUpdateRow, onDeleteRow, onAddRow }: Props) {
  const nameCol = schema.columns[0]

  function handleEditName(rowId: string, name: string) {
    const row = schema.rows.find((r) => r.id === rowId)
    if (!row || !nameCol) return
    onUpdateRow(rowId, { ...(row.properties as Record<string, unknown>), [nameCol.id]: name })
  }

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {schema.rows.map((row) => (
          <GalleryCard
            key={row.id}
            row={row}
            schema={schema}
            onDelete={() => onDeleteRow(row.id)}
            onEditName={handleEditName}
          />
        ))}

        {/* New card button */}
        <button
          onClick={() => onAddRow()}
          className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-4 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:border-gray-400 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors min-h-[80px]"
        >
          <Plus size={15} />
          New
        </button>
      </div>
    </div>
  )
}
