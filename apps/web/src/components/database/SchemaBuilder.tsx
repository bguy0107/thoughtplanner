'use client'

import { useEffect, useState } from 'react'
import { AlignLeft, Calendar, CheckSquare, ChevronDown, ChevronRight, Hash, Link, Plus, Tags, Trash2, X, RefreshCw } from 'lucide-react'
import { api, type Column, type ColumnType, type DbSchema, type PageSummary, type RollupOperation } from '@/lib/api'

const TYPE_LABELS: Record<ColumnType, string> = {
  text: 'Text',
  number: 'Number',
  checkbox: 'Checkbox',
  date: 'Date',
  select: 'Select',
  multi_select: 'Multi-select',
  relation: 'Relation',
  rollup: 'Rollup',
}

const TYPE_ICONS: Record<ColumnType, React.ReactNode> = {
  text: <AlignLeft size={13} />,
  number: <Hash size={13} />,
  checkbox: <CheckSquare size={13} />,
  date: <Calendar size={13} />,
  select: <ChevronDown size={13} />,
  multi_select: <Tags size={13} />,
  relation: <Link size={13} />,
  rollup: <RefreshCw size={13} />,
}

const ALL_TYPES: ColumnType[] = ['text', 'number', 'checkbox', 'date', 'select', 'multi_select', 'relation', 'rollup']

const ROLLUP_OPS: RollupOperation[] = ['count', 'sum', 'avg', 'min', 'max']

interface Props {
  schema: DbSchema
  onUpdate: (columns: Column[]) => void
  onUpdateRow: (rowId: string, properties: Record<string, unknown>) => void
  onClose: () => void
}

export function SchemaBuilder({ schema, onUpdate, onUpdateRow, onClose }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [dbPages, setDbPages] = useState<PageSummary[]>([])

  useEffect(() => {
    api.pages.list().then((pages) => setDbPages(pages.filter((p) => p.isDatabase)))
  }, [])

  function updateColumn(id: string, patch: Partial<Column>) {
    onUpdate(schema.columns.map((c) => c.id === id ? { ...c, ...patch } : c))
  }

  function deleteColumn(id: string) {
    if (!confirm('Delete this column? Row data for it will be lost.')) return
    onUpdate(schema.columns.filter((c) => c.id !== id))
  }

  function addColumn() {
    const col: Column = { id: crypto.randomUUID(), name: 'New column', type: 'text' }
    onUpdate([...schema.columns, col])
    setExpanded(col.id)
  }

  // Values entered under a column's previous type may not just be a
  // different "flavor" of the same shape (a plain string isn't a valid
  // multi_select value, which every view expects to be an array) — clear
  // them rather than leaving stale, wrongly-shaped data sitting around that
  // could crash a view or silently look consistent when it isn't.
  function changeColumnType(col: Column, type: ColumnType) {
    if (type === col.type) return
    updateColumn(col.id, {
      type,
      options: undefined,
      targetPageId: undefined,
      relationColId: undefined,
      targetColId: undefined,
      operation: undefined,
    })
    for (const row of schema.rows) {
      if (row.properties[col.id] === undefined) continue
      const { [col.id]: _removed, ...rest } = row.properties
      onUpdateRow(row.id, rest)
    }
  }

  function addOption(col: Column) {
    const name = prompt('Option name:')
    if (!name?.trim()) return
    updateColumn(col.id, { options: [...(col.options ?? []), name.trim()] })
  }

  // Removing an option must also clear it from any row still holding that
  // value — otherwise the stale value lingers invisibly (and reappears if an
  // option with the same name is ever re-added).
  function removeOption(col: Column, opt: string) {
    updateColumn(col.id, { options: (col.options ?? []).filter((o) => o !== opt) })
    for (const row of schema.rows) {
      const val = row.properties[col.id]
      if (col.type === 'select' && val === opt) {
        onUpdateRow(row.id, { ...row.properties, [col.id]: null })
      } else if (col.type === 'multi_select' && Array.isArray(val) && val.includes(opt)) {
        onUpdateRow(row.id, { ...row.properties, [col.id]: (val as string[]).filter((v) => v !== opt) })
      }
    }
  }

  const relationCols = schema.columns.filter((c) => c.type === 'relation')

  return (
    <aside className="w-72 flex-shrink-0 border-l border-gray-200 dark:border-gray-800 bg-[#f7f7f5] dark:bg-sidebar-dark-bg flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <span className="text-sm font-semibold text-gray-700 dark:text-sidebar-dark-text">Properties</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
          <X size={15} />
        </button>
      </div>

      {/* Column list */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
        {schema.columns.map((col, idx) => (
          <div key={col.id} className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Column row */}
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                onClick={() => setExpanded((e) => e === col.id ? null : col.id)}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {expanded === col.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">{TYPE_ICONS[col.type]}</span>
              <input
                value={col.name}
                onChange={(e) => updateColumn(col.id, { name: e.target.value })}
                className="flex-1 text-sm text-gray-800 dark:text-gray-200 outline-none bg-transparent min-w-0"
                disabled={idx === 0}
              />
              {idx > 0 && (
                <button
                  onClick={() => deleteColumn(col.id)}
                  className="p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-950/50 text-gray-300 dark:text-gray-600 hover:text-red-500 transition-colors flex-shrink-0"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>

            {/* Expanded editor */}
            {expanded === col.id && (
              <div className="border-t border-gray-100 dark:border-gray-700 px-3 py-3 space-y-3">
                {/* Type selector */}
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Type</p>
                  <div className="grid grid-cols-2 gap-1">
                    {ALL_TYPES.map((t) => (
                      <button
                        key={t}
                        onClick={() => changeColumnType(col, t)}
                        disabled={idx === 0 && t !== 'text'}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors ${
                          col.type === t
                            ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-medium'
                            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30'
                        }`}
                      >
                        {TYPE_ICONS[t]}
                        {TYPE_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Options for select / multi_select */}
                {(col.type === 'select' || col.type === 'multi_select') && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Options</p>
                    <div className="space-y-1">
                      {(col.options ?? []).map((opt) => (
                        <div key={opt} className="flex items-center gap-2 group">
                          <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">{opt}</span>
                          <button
                            onClick={() => removeOption(col, opt)}
                            className="p-0.5 rounded text-transparent group-hover:text-gray-400 dark:group-hover:text-gray-500 hover:!text-red-500 transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => addOption(col)}
                      className="mt-2 flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                    >
                      <Plus size={12} />
                      Add option
                    </button>
                  </div>
                )}

                {/* Relation config */}
                {col.type === 'relation' && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Target database</p>
                    <select
                      value={col.targetPageId ?? ''}
                      onChange={(e) => updateColumn(col.id, { targetPageId: e.target.value || undefined })}
                      className="w-full text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-900 dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-300"
                    >
                      <option value="">Select a database…</option>
                      {dbPages.map((p) => (
                        <option key={p.id} value={p.id}>{p.icon ? `${p.icon} ` : ''}{p.title}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Rollup config */}
                {col.type === 'rollup' && (
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Relation column</p>
                      <select
                        value={col.relationColId ?? ''}
                        onChange={(e) => updateColumn(col.id, { relationColId: e.target.value || undefined })}
                        className="w-full text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-900 dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-300"
                      >
                        <option value="">Select a relation…</option>
                        {relationCols.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Target column (in linked database)</p>
                      <input
                        value={col.targetColId ?? ''}
                        onChange={(e) => updateColumn(col.id, { targetColId: e.target.value || undefined })}
                        placeholder="Column ID from target database"
                        className="w-full text-xs border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-300"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Aggregation</p>
                      <div className="flex flex-wrap gap-1">
                        {ROLLUP_OPS.map((op) => (
                          <button
                            key={op}
                            onClick={() => updateColumn(col.id, { operation: op })}
                            className={`px-2 py-0.5 rounded text-xs transition-colors ${
                              col.operation === op
                                ? 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 font-medium'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`}
                          >
                            {op}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add column */}
      <div className="border-t border-gray-200 dark:border-gray-800 p-2">
        <button
          onClick={addColumn}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-sidebar-dark-text rounded hover:bg-[#ebebea] dark:hover:bg-sidebar-dark-hover transition-colors"
        >
          <Plus size={14} />
          Add property
        </button>
      </div>
    </aside>
  )
}
