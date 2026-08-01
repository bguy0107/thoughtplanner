'use client'

import { useEffect, useState } from 'react'
import { AlignLeft, Calendar, CheckSquare, ChevronDown, ChevronRight, Hash, Link, Plus, Tags, Trash2, X, RefreshCw } from 'lucide-react'
import { api, type Column, type ColumnType, type DbSchema, type PageSummary, type RollupOperation } from '@/lib/api'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { PromptModal } from '@/components/ui/PromptModal'

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

// Source types whose existing values can be turned into select options
// rather than wiped on conversion — i.e. types with one scalar value per
// cell that stringifies to a meaningful label. multi_select/relation/rollup
// are excluded: their values are arrays or derived, not a single label.
const SELECT_CONVERTIBLE_SOURCE_TYPES: ColumnType[] = ['text', 'number', 'checkbox', 'date']

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
  const [deleteColumnId, setDeleteColumnId] = useState<string | null>(null)
  const [addOptionFor, setAddOptionFor] = useState<string | null>(null)

  useEffect(() => {
    api.pages.list().then((pages) => setDbPages(pages.filter((p) => p.isDatabase)))
  }, [])

  function updateColumn(id: string, patch: Partial<Column>) {
    onUpdate(schema.columns.map((c) => c.id === id ? { ...c, ...patch } : c))
  }

  function deleteColumn(id: string) {
    onUpdate(schema.columns.filter((c) => c.id !== id))
    setDeleteColumnId(null)
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
  //
  // Converting a scalar column (text/number/checkbox/date) to select is the
  // one case where the old values ARE meaningful as a shape for the new
  // type — a string is already a valid select value — so instead of wiping,
  // we turn the distinct existing values into options and rewrite each cell
  // to point at its (normalized) option.
  function changeColumnType(col: Column, type: ColumnType) {
    if (type === col.type) return

    if (type === 'select' && SELECT_CONVERTIBLE_SOURCE_TYPES.includes(col.type)) {
      convertColumnToSelect(col)
      return
    }

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
      // Setting to null (rather than sending a diff that omits the key) matches
      // onUpdateRow's partial-patch contract — the server merges keys present
      // in the patch, so an omitted key wouldn't clear anything. getProp()
      // treats null the same as "absent" everywhere else in the database views.
      onUpdateRow(row.id, { [col.id]: null })
    }
  }

  // Renders a scalar cell value the way it would read as a select option
  // label. Returns null for values with no meaningful label (empty/blank).
  function toOptionLabel(col: Column, raw: unknown): string | null {
    if (raw === undefined || raw === null) return null
    if (col.type === 'checkbox') return raw ? 'Yes' : 'No'
    const str = String(raw).trim()
    return str === '' ? null : str
  }

  function convertColumnToSelect(col: Column) {
    // Options are deduped case/whitespace-insensitively (so "Done" and
    // "done " collapse into one option) while keeping the first-seen
    // casing as the canonical, displayed option value.
    const canonicalByKey = new Map<string, string>()
    const updates: { rowId: string; value: string | null }[] = []
    for (const row of schema.rows) {
      const raw = row.properties[col.id]
      const label = toOptionLabel(col, raw)
      if (label === null) {
        if (raw !== undefined) updates.push({ rowId: row.id, value: null })
        continue
      }
      const key = label.toLowerCase()
      if (!canonicalByKey.has(key)) canonicalByKey.set(key, label)
      updates.push({ rowId: row.id, value: canonicalByKey.get(key)! })
    }

    updateColumn(col.id, {
      type: 'select',
      options: Array.from(canonicalByKey.values()),
      targetPageId: undefined,
      relationColId: undefined,
      targetColId: undefined,
      operation: undefined,
    })
    for (const { rowId, value } of updates) onUpdateRow(rowId, { [col.id]: value })
  }

  function addOption(col: Column, name: string) {
    updateColumn(col.id, { options: [...(col.options ?? []), name] })
    setAddOptionFor(null)
  }

  // Removing an option must also clear it from any row still holding that
  // value — otherwise the stale value lingers invisibly (and reappears if an
  // option with the same name is ever re-added).
  function removeOption(col: Column, opt: string) {
    updateColumn(col.id, { options: (col.options ?? []).filter((o) => o !== opt) })
    for (const row of schema.rows) {
      const val = row.properties[col.id]
      if (col.type === 'select' && val === opt) {
        onUpdateRow(row.id, { [col.id]: null })
      } else if (col.type === 'multi_select' && Array.isArray(val) && val.includes(opt)) {
        onUpdateRow(row.id, { [col.id]: (val as string[]).filter((v) => v !== opt) })
      }
    }
  }

  const relationCols = schema.columns.filter((c) => c.type === 'relation')
  const addOptionCol = schema.columns.find((c) => c.id === addOptionFor)

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
                key={col.id}
                defaultValue={col.name}
                onBlur={(e) => {
                  if (e.target.value !== col.name) updateColumn(col.id, { name: e.target.value })
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                }}
                className="flex-1 text-sm text-gray-800 dark:text-gray-200 outline-none bg-transparent min-w-0"
                disabled={idx === 0}
              />
              {idx > 0 && (
                <button
                  onClick={() => setDeleteColumnId(col.id)}
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
                      onClick={() => setAddOptionFor(col.id)}
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

      {deleteColumnId && (
        <ConfirmModal
          title="Delete column?"
          message="Row data for this column will be lost."
          confirmLabel="Delete"
          onConfirm={() => deleteColumn(deleteColumnId)}
          onCancel={() => setDeleteColumnId(null)}
        />
      )}

      {addOptionCol && (
        <PromptModal
          title="New option"
          placeholder="Option name"
          onConfirm={(name) => addOption(addOptionCol, name)}
          onCancel={() => setAddOptionFor(null)}
        />
      )}
    </aside>
  )
}
