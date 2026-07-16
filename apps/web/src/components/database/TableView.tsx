'use client'

import { useEffect, useRef, useState } from 'react'
import { AlignLeft, ArrowDown, ArrowUp, Calendar, CheckSquare, ChevronDown, Hash, Link, Plus, RefreshCw, Tags, Trash2 } from 'lucide-react'
import { api, type Column, type ColumnType, type DbRow, type DbSchema, type RelatedRow } from '@/lib/api'

const TYPE_ICONS: Record<ColumnType, React.ReactNode> = {
  text: <AlignLeft size={12} />,
  number: <Hash size={12} />,
  checkbox: <CheckSquare size={12} />,
  date: <Calendar size={12} />,
  select: <ChevronDown size={12} />,
  multi_select: <Tags size={12} />,
  relation: <Link size={12} />,
  rollup: <RefreshCw size={12} />,
}

const CHIP_COLORS = [
  'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
  'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300',
  'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300',
  'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300',
  'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300',
  'bg-pink-100 text-pink-700 dark:bg-pink-950/50 dark:text-pink-300',
  'bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300',
]

export function chipColor(options: string[], value: string) {
  const i = options.indexOf(value)
  return CHIP_COLORS[i < 0 ? 0 : i % CHIP_COLORS.length]
}

function getProp(row: DbRow, colId: string): unknown {
  return (row.properties as Record<string, unknown>)[colId] ?? null
}

function displayValue(row: DbRow, col: Column): string {
  const v = getProp(row, col.id)
  if (v == null) return ''
  if (col.type === 'multi_select' && Array.isArray(v)) return (v as string[]).join(', ')
  return String(v)
}

type EditCell = { rowId: string; colId: string } | null
type SortState = { colId: string; dir: 'asc' | 'desc' } | null

function compareVals(a: unknown, b: unknown, type: ColumnType, dir: 'asc' | 'desc'): number {
  const m = dir === 'asc' ? 1 : -1
  if (a == null && b == null) return 0
  if (a == null) return m
  if (b == null) return -m
  if (type === 'number') return ((a as number) - (b as number)) * m
  if (type === 'checkbox') return ((a ? 1 : 0) - (b ? 1 : 0)) * m
  return String(a).localeCompare(String(b)) * m
}

interface Props {
  schema: DbSchema
  onUpdateRow: (rowId: string, props: Record<string, unknown>) => void
  onDeleteRow: (rowId: string) => void
  onAddRow: (props?: Record<string, unknown>) => void
  onUpdateSchema: (columns: Column[]) => void
}

export function TableView({ schema, onUpdateRow, onDeleteRow, onAddRow, onUpdateSchema }: Props) {
  const [editing, setEditing] = useState<EditCell>(null)
  const [selectOpen, setSelectOpen] = useState<EditCell>(null)
  const [relationOpen, setRelationOpen] = useState<EditCell>(null)
  const [sort, setSort] = useState<SortState>(null)
  const [filter, setFilter] = useState('')
  const [lockHeaders, setLockHeaders] = useState(true)
  const [lockFirstColumn, setLockFirstColumn] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const colMap = new Map(schema.columns.map((c) => [c.id, c]))

  const filtered = schema.rows.filter((row) => {
    if (!filter) return true
    return schema.columns.some((col) => {
      const v = getProp(row, col.id)
      return v != null && String(v).toLowerCase().includes(filter.toLowerCase())
    })
  })

  const sorted = sort
    ? [...filtered].sort((a, b) => {
        const col = colMap.get(sort.colId)
        if (!col) return 0
        return compareVals(getProp(a, col.id), getProp(b, col.id), col.type, sort.dir)
      })
    : filtered

  function cycleSort(colId: string) {
    setSort((s) => {
      if (!s || s.colId !== colId) return { colId, dir: 'asc' }
      if (s.dir === 'asc') return { colId, dir: 'desc' }
      return null
    })
  }

  function startEdit(rowId: string, col: Column) {
    if (col.type === 'checkbox') return
    if (col.type === 'rollup') return
    if (col.type === 'select' || col.type === 'multi_select') {
      setSelectOpen({ rowId, colId: col.id })
      return
    }
    if (col.type === 'relation') {
      setRelationOpen({ rowId, colId: col.id })
      return
    }
    setEditing({ rowId, colId: col.id })
  }

  function commitEdit(row: DbRow, colId: string, raw: string) {
    const col = colMap.get(colId)
    if (!col) return
    const value = col.type === 'number' ? (parseFloat(raw) || 0) : raw
    onUpdateRow(row.id, { ...(row.properties as Record<string, unknown>), [colId]: value })
    setEditing(null)
  }

  function toggleCheck(row: DbRow, colId: string) {
    const cur = getProp(row, colId) as boolean | null
    onUpdateRow(row.id, { ...(row.properties as Record<string, unknown>), [colId]: !cur })
  }

  function setSelect(row: DbRow, colId: string, value: string) {
    onUpdateRow(row.id, { ...(row.properties as Record<string, unknown>), [colId]: value })
    setSelectOpen(null)
  }

  function toggleMulti(row: DbRow, colId: string, value: string) {
    const cur = (getProp(row, colId) as string[] | null) ?? []
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]
    onUpdateRow(row.id, { ...(row.properties as Record<string, unknown>), [colId]: next })
  }

  function clearMulti(row: DbRow, colId: string) {
    onUpdateRow(row.id, { ...(row.properties as Record<string, unknown>), [colId]: [] })
    setSelectOpen(null)
  }

  function toggleRelation(row: DbRow, colId: string, targetRowId: string) {
    const cur = (getProp(row, colId) as string[] | null) ?? []
    const next = cur.includes(targetRowId) ? cur.filter((v) => v !== targetRowId) : [...cur, targetRowId]
    onUpdateRow(row.id, { ...(row.properties as Record<string, unknown>), [colId]: next })
  }

  function addColumn() {
    const name = prompt('Column name:')
    if (!name?.trim()) return
    onUpdateSchema([...schema.columns, { id: crypto.randomUUID(), name: name.trim(), type: 'text' }])
  }

  return (
    <div className="w-full">
      {/* Filter bar */}
      <div className="mb-3 flex items-center gap-3">
        <input
          type="text"
          placeholder="Filter rows…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-md outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100 w-52"
        />
        <span className="text-xs text-gray-400 dark:text-gray-500">{sorted.length} row{sorted.length !== 1 ? 's' : ''}</span>
        <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer select-none ml-auto">
          <input
            type="checkbox"
            checked={lockHeaders}
            onChange={(e) => setLockHeaders(e.target.checked)}
            className="cursor-pointer accent-blue-500"
          />
          Lock headers
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={lockFirstColumn}
            onChange={(e) => setLockFirstColumn(e.target.checked)}
            className="cursor-pointer accent-blue-500"
          />
          Lock first column
        </label>
      </div>

      {/* Table */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className={lockHeaders ? 'max-h-[70vh] overflow-auto' : 'overflow-x-auto'}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={`${lockHeaders ? 'sticky top-0 z-10' : ''} bg-[#f7f7f5] dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700`}>
                {schema.columns.map((col, i) => (
                  <th
                    key={col.id}
                    style={{ minWidth: col.type === 'checkbox' ? 64 : 160 }}
                    className={`text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700 last:border-r-0 whitespace-nowrap ${
                      lockFirstColumn && i === 0 ? 'sticky left-0 z-20 bg-[#f7f7f5] dark:bg-gray-800' : ''
                    }`}
                  >
                    <button
                      onClick={() => cycleSort(col.id)}
                      className="flex items-center gap-1.5 hover:text-gray-900 dark:hover:text-gray-100 transition-colors group"
                    >
                      <span className="text-gray-400 dark:text-gray-500">{TYPE_ICONS[col.type]}</span>
                      {col.name}
                      {sort?.colId === col.id
                        ? sort.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
                        : <ArrowUp size={11} className="opacity-0 group-hover:opacity-25" />}
                    </button>
                  </th>
                ))}
                <th className="px-2 py-2 w-10 border-r border-gray-200 dark:border-gray-700">
                  <button
                    onClick={addColumn}
                    title="Add column"
                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  >
                    <Plus size={13} />
                  </button>
                </th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 dark:border-gray-800 last:border-b-0 hover:bg-[#fafafa] dark:hover:bg-gray-800/50 group">
                  {schema.columns.map((col, i) => (
                    <td
                      key={col.id}
                      className={`px-3 py-2 border-r border-gray-100 dark:border-gray-800 last:border-r-0 cursor-text relative ${
                        lockFirstColumn && i === 0
                          ? 'sticky left-0 z-10 bg-white dark:bg-gray-900 group-hover:bg-[#fafafa] dark:group-hover:bg-gray-800/50'
                          : ''
                      }`}
                      onClick={() => startEdit(row.id, col)}
                    >
                      {col.type === 'checkbox' ? (
                        <input
                          type="checkbox"
                          checked={!!(getProp(row, col.id) as boolean)}
                          onChange={() => toggleCheck(row, col.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="cursor-pointer accent-blue-500"
                        />
                      ) : col.type === 'rollup' ? (
                        <span className="text-gray-500 dark:text-gray-400 text-xs font-mono">
                          {getProp(row, col.id) != null ? String(getProp(row, col.id)) : '—'}
                        </span>
                      ) : col.type === 'relation' ? (
                        <div className="relative">
                          <RelationCell
                            row={row}
                            col={col}
                            isOpen={relationOpen?.rowId === row.id && relationOpen?.colId === col.id}
                            onToggle={(targetRowId) => toggleRelation(row, col.id, targetRowId)}
                            onClose={() => setRelationOpen(null)}
                          />
                        </div>
                      ) : editing?.rowId === row.id && editing?.colId === col.id ? (
                        <input
                          ref={inputRef}
                          type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                          defaultValue={displayValue(row, col)}
                          onBlur={(e) => commitEdit(row, col.id, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                            if (e.key === 'Escape') setEditing(null)
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full outline-none bg-transparent"
                        />
                      ) : col.type === 'select' ? (
                        <div className="relative">
                          {getProp(row, col.id)
                            ? <span className={`px-2 py-0.5 rounded text-xs font-medium ${chipColor(col.options ?? [], getProp(row, col.id) as string)}`}>{getProp(row, col.id) as string}</span>
                            : <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>}
                          {selectOpen?.rowId === row.id && selectOpen?.colId === col.id && (
                            <OptionDropdown
                              options={col.options ?? []}
                              selected={[getProp(row, col.id) as string].filter(Boolean)}
                              isMulti={false}
                              onSelect={(v) => setSelect(row, col.id, v)}
                              onClose={() => setSelectOpen(null)}
                            />
                          )}
                        </div>
                      ) : col.type === 'multi_select' ? (
                        <div className="relative">
                          <div className="flex flex-wrap gap-1 min-h-[20px]">
                            {((getProp(row, col.id) as string[] | null) ?? []).map((opt) => (
                              <span key={opt} className={`px-2 py-0.5 rounded text-xs font-medium ${chipColor(col.options ?? [], opt)}`}>{opt}</span>
                            ))}
                            {!((getProp(row, col.id) as string[] | null) ?? []).length && (
                              <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                            )}
                          </div>
                          {selectOpen?.rowId === row.id && selectOpen?.colId === col.id && (
                            <OptionDropdown
                              options={col.options ?? []}
                              selected={(getProp(row, col.id) as string[] | null) ?? []}
                              isMulti={true}
                              onToggle={(v) => toggleMulti(row, col.id, v)}
                              onClear={() => clearMulti(row, col.id)}
                              onClose={() => setSelectOpen(null)}
                            />
                          )}
                        </div>
                      ) : (
                        <span className={displayValue(row, col) ? 'text-gray-800 dark:text-gray-200' : 'text-gray-300 dark:text-gray-600 text-xs'}>
                          {displayValue(row, col) || '—'}
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="border-r border-gray-100 dark:border-gray-800" />
                  <td className="pr-2 text-right">
                    <button
                      onClick={() => onDeleteRow(row.id)}
                      title="Delete row"
                      className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/50 text-transparent group-hover:text-gray-300 dark:group-hover:text-gray-600 hover:!text-red-500 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          onClick={() => onAddRow()}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400 hover:bg-[#fafafa] dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors border-t border-gray-100 dark:border-gray-800"
        >
          <Plus size={14} />
          Add row
        </button>
      </div>
    </div>
  )
}

// ─── RelationCell ──────────────────────────────────────────────────────────────

interface RelationCellProps {
  row: DbRow
  col: Column
  isOpen: boolean
  onToggle: (targetRowId: string) => void
  onClose: () => void
}

function RelationCell({ row, col, isOpen, onToggle, onClose }: RelationCellProps) {
  const selectedIds = (getProp(row, col.id) as string[] | null) ?? []
  const [resolvedNames, setResolvedNames] = useState<RelatedRow[]>([])
  const [allRows, setAllRows] = useState<RelatedRow[]>([])
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!col.targetPageId || selectedIds.length === 0) { setResolvedNames([]); return }
    api.databases.relatedRows(col.targetPageId, selectedIds).then(setResolvedNames)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [col.targetPageId, selectedIds.join(',')])

  useEffect(() => {
    if (!isOpen || !col.targetPageId) return
    api.databases.get(col.targetPageId).then((schema) => {
      const nameColId = schema.columns[0]?.id
      setAllRows(schema.rows.map((r) => ({
        id: r.id,
        displayName: nameColId ? String((r.properties as Record<string, unknown>)[nameColId] ?? 'Untitled') : 'Untitled',
      })))
    })
  }, [isOpen, col.targetPageId])

  useEffect(() => {
    if (!isOpen) return
    function handleMouseDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [isOpen, onClose])

  return (
    <div ref={ref}>
      <div className="flex flex-wrap gap-1 min-h-[20px]">
        {resolvedNames.map((r) => (
          <span key={r.id} className="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 truncate max-w-[140px]" title={r.displayName}>
            {r.displayName}
          </span>
        ))}
        {resolvedNames.length === 0 && <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>}
      </div>

      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-full z-50 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg min-w-52 max-h-56 overflow-y-auto py-1"
        >
          {!col.targetPageId && (
            <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">No target database configured.</p>
          )}
          {allRows.length === 0 && col.targetPageId && (
            <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">No rows in target database.</p>
          )}
          {allRows.map((r) => (
            <button
              key={r.id}
              onClick={() => onToggle(r.id)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-left dark:text-gray-200"
            >
              <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 text-xs ${
                selectedIds.includes(r.id) ? 'bg-purple-500 border-purple-500 text-white' : 'border-gray-300 dark:border-gray-600'
              }`}>
                {selectedIds.includes(r.id) && '✓'}
              </span>
              <span className="truncate">{r.displayName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── OptionDropdown ────────────────────────────────────────────────────────────

interface OptionDropdownProps {
  options: string[]
  selected: string[]
  isMulti: boolean
  onSelect?: (value: string) => void
  onToggle?: (value: string) => void
  onClear?: () => void
  onClose: () => void
}

function OptionDropdown({ options, selected, isMulti, onSelect, onToggle, onClear, onClose }: OptionDropdownProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [onClose])

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      className="absolute left-0 top-full z-50 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg min-w-44 py-1"
    >
      {options.length === 0 && (
        <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">No options — add via Properties.</p>
      )}
      {options.map((opt) => (
        <button
          key={opt}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-left"
          onClick={() => isMulti ? onToggle?.(opt) : onSelect?.(opt)}
        >
          {isMulti && (
            <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${selected.includes(opt) ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300 dark:border-gray-600'}`}>
              {selected.includes(opt) && '✓'}
            </span>
          )}
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${chipColor(options, opt)}`}>{opt}</span>
        </button>
      ))}
      {isMulti && selected.length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-700 mt-1 pt-1">
          <button
            className="w-full px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-left"
            onClick={onClear}
          >
            Clear selection
          </button>
        </div>
      )}
    </div>
  )
}
