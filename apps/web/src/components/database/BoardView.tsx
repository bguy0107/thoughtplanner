'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { Column, DbRow, DbSchema } from '@/lib/api'
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

interface CardProps {
  row: DbRow
  nameColId: string
  groupColId: string
  allCols: Column[]
  onDelete: () => void
  onEdit: (rowId: string, name: string) => void
}

function Card({ row, nameColId, groupColId, allCols, onDelete, onEdit }: CardProps) {
  const [editing, setEditing] = useState(false)
  const name = (getProp(row, nameColId) as string | null) ?? ''

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 group hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-2">
        {editing ? (
          <input
            autoFocus
            defaultValue={name}
            className="flex-1 text-sm text-gray-800 dark:text-gray-200 outline-none border-b border-blue-300 bg-transparent"
            onBlur={(e) => { onEdit(row.id, e.target.value); setEditing(false) }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          />
        ) : (
          <span
            className="flex-1 text-sm text-gray-800 dark:text-gray-200 cursor-text min-h-[20px]"
            onClick={() => setEditing(true)}
          >
            {name || <span className="text-gray-300 dark:text-gray-600">Untitled</span>}
          </span>
        )}
        <button
          onClick={onDelete}
          className="p-0.5 rounded text-transparent group-hover:text-gray-300 dark:group-hover:text-gray-600 hover:!text-red-500 transition-colors flex-shrink-0"
        >
          <Trash2 size={12} />
        </button>
      </div>
      {/* Extra properties as badges */}
      {allCols.filter((c) => c.id !== nameColId && c.id !== groupColId).map((col) => {
        const val = getProp(row, col.id)
        if (val == null || val === '' || (Array.isArray(val) && val.length === 0)) return null
        return (
          <div key={col.id} className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
            <span className="font-medium text-gray-500 dark:text-gray-400">{col.name}:</span>{' '}
            {Array.isArray(val) ? (val as string[]).join(', ') : String(val)}
          </div>
        )
      })}
    </div>
  )
}

export function BoardView({ schema, onUpdateRow, onDeleteRow, onAddRow }: Props) {
  const nameCol = schema.columns[0]
  const groupCol = schema.columns.find((c) => c.type === 'select')

  if (!nameCol) {
    return <div className="py-10 text-center text-gray-400 dark:text-gray-500 text-sm">Add a column to get started.</div>
  }

  if (!groupCol) {
    return (
      <div className="py-10 text-center text-gray-400 dark:text-gray-500 text-sm">
        Board view requires a <span className="font-medium text-gray-600 dark:text-gray-300">Select</span> column to group by.<br />
        Open <span className="font-medium text-gray-600 dark:text-gray-300">Properties</span> and add one.
      </div>
    )
  }

  const options = groupCol.options ?? []
  const groups = [
    { label: 'No status', value: null as string | null, color: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
    ...options.map((opt, i) => ({ label: opt, value: opt, color: chipColor(options, opt) })),
  ]

  function rowGroup(row: DbRow): string | null {
    const v = getProp(row, groupCol!.id) as string | null
    return v && options.includes(v) ? v : null
  }

  function handleEditName(rowId: string, name: string) {
    const row = schema.rows.find((r) => r.id === rowId)
    if (!row) return
    onUpdateRow(rowId, { ...(row.properties as Record<string, unknown>), [nameCol.id]: name })
  }

  function handleMoveCard(rowId: string, newGroup: string | null) {
    const row = schema.rows.find((r) => r.id === rowId)
    if (!row) return
    const props = { ...(row.properties as Record<string, unknown>), [groupCol!.id]: newGroup ?? '' }
    onUpdateRow(rowId, props)
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 400 }}>
      {groups.map((group) => {
        const rows = schema.rows.filter((r) => rowGroup(r) === group.value)
        return (
          <div key={group.label} className="flex-shrink-0 w-64">
            {/* Column header */}
            <div className="flex items-center gap-2 mb-3">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${group.color}`}>
                {group.label}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">{rows.length}</span>
            </div>

            {/* Cards */}
            <div className="space-y-2">
              {rows.map((row) => (
                <Card
                  key={row.id}
                  row={row}
                  nameColId={nameCol.id}
                  groupColId={groupCol.id}
                  allCols={schema.columns}
                  onDelete={() => onDeleteRow(row.id)}
                  onEdit={handleEditName}
                />
              ))}
            </div>

            {/* Add card */}
            <button
              onClick={() => onAddRow({ [groupCol!.id]: group.value ?? '' })}
              className="mt-2 w-full flex items-center gap-1.5 px-3 py-2 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white dark:hover:bg-gray-800 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
            >
              <Plus size={14} />
              Add card
            </button>
          </div>
        )
      })}
    </div>
  )
}
