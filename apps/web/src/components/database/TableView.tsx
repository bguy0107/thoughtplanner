'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlignLeft, ArrowDown, ArrowUp, Calendar, CheckSquare, ChevronDown, GripVertical, Hash, Link, Plus, RefreshCw, Tags, Trash2 } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { positionBetween } from '@/lib/position'
import { cn } from '@/lib/utils'
import { api, type Column, type ColumnType, type DbRow, type DbSchema, type RelatedRow } from '@/lib/api'
import { PromptModal } from '@/components/ui/PromptModal'

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

// A property's stored value can be stale relative to its column's current
// type (e.g. the column was text when the value was written, then changed to
// multi_select) — never assume it's already an array.
function getMultiSelectValue(row: DbRow, colId: string): string[] {
  const v = getProp(row, colId)
  return Array.isArray(v) ? (v as string[]) : []
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
  onReorderRow: (rowId: string, position: number) => void
}

export function TableView({ schema, onUpdateRow, onDeleteRow, onAddRow, onUpdateSchema, onReorderRow }: Props) {
  const [editing, setEditing] = useState<EditCell>(null)
  const [selectOpen, setSelectOpen] = useState<EditCell>(null)
  const [relationOpen, setRelationOpen] = useState<EditCell>(null)
  const [sort, setSort] = useState<SortState>(null)
  const [filter, setFilter] = useState('')
  const [columnFilter, setColumnFilter] = useState('')
  const [lockHeaders, setLockHeaders] = useState(true)
  const [lockFirstColumn, setLockFirstColumn] = useState(false)
  const [addColumnOpen, setAddColumnOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  // DndContext's screen-reader announcer renders a <div>, which isn't valid
  // HTML directly inside <tr>/<thead>/<tbody> — portal it out to <body>.
  // Accessibility itself defers rendering until after mount, so this is
  // safe to resolve eagerly without a hydration mismatch.
  const a11yContainer = typeof document !== 'undefined' ? document.body : undefined

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const colMap = useMemo(() => new Map(schema.columns.map((c) => [c.id, c])), [schema.columns])

  const visibleColumns = useMemo(
    () => schema.columns.filter((col) => col.name.toLowerCase().includes(columnFilter.toLowerCase())),
    [schema.columns, columnFilter],
  )

  const filtered = useMemo(
    () =>
      schema.rows.filter((row) => {
        if (!filter) return true
        return schema.columns.some((col) => {
          const v = getProp(row, col.id)
          return v != null && String(v).toLowerCase().includes(filter.toLowerCase())
        })
      }),
    [schema.rows, schema.columns, filter],
  )

  const sorted = useMemo(
    () =>
      sort
        ? [...filtered].sort((a, b) => {
            const col = colMap.get(sort.colId)
            if (!col) return 0
            return compareVals(getProp(a, col.id), getProp(b, col.id), col.type, sort.dir)
          })
        : filtered,
    [filtered, sort, colMap],
  )

  // Reordering only makes sense against the rows'/columns' natural stored order —
  // disable drag while a filter or sort is hiding/reshuffling what's on screen,
  // since the dragged index wouldn't map cleanly back onto the full list.
  const rowsSortable = !sort && !filter
  const columnsSortable = !columnFilter

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
    // Only clear if this is still the active cell — Tab/Enter navigation commits
    // and immediately re-targets `editing` to the next cell in the same handler,
    // and the outgoing input's native blur (fired on unmount) must not clobber that.
    setEditing((cur) => (cur?.rowId === row.id && cur?.colId === colId ? null : cur))
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

  function addColumn(name: string) {
    onUpdateSchema([...schema.columns, { id: crypto.randomUUID(), name, type: 'text' }])
    setAddColumnOpen(false)
  }

  function handleColumnDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = visibleColumns.findIndex((c) => c.id === active.id)
    const newIndex = visibleColumns.findIndex((c) => c.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    onUpdateSchema(arrayMove(visibleColumns, oldIndex, newIndex))
  }

  function handleRowDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sorted.findIndex((r) => r.id === active.id)
    const newIndex = sorted.findIndex((r) => r.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    // Only the dragged row's position needs to change — a fractional value
    // between its new neighbors keeps every other row untouched.
    const reordered = arrayMove(sorted, oldIndex, newIndex)
    const movedIndex = reordered.findIndex((r) => r.id === active.id)
    const position = positionBetween(reordered[movedIndex - 1]?.position, reordered[movedIndex + 1]?.position)
    onReorderRow(active.id as string, position)
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

      {/* Column filter bar */}
      <div className="mb-3 flex items-center gap-3">
        <input
          type="text"
          placeholder="Filter columns…"
          value={columnFilter}
          onChange={(e) => setColumnFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-md outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100 w-52"
        />
        <span className="text-xs text-gray-400 dark:text-gray-500">{visibleColumns.length} column{visibleColumns.length !== 1 ? 's' : ''}</span>
        {!rowsSortable && (
          <span className="text-xs text-gray-400 dark:text-gray-500">· clear filter/sort to drag-reorder rows</span>
        )}
        {!columnsSortable && (
          <span className="text-xs text-gray-400 dark:text-gray-500">· clear column filter to drag-reorder columns</span>
        )}
      </div>

      {/* Table */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className={lockHeaders ? 'max-h-[70vh] overflow-auto' : 'overflow-x-auto'}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={`${lockHeaders ? 'sticky top-0 z-20' : ''} bg-[#f7f7f5] dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700`}>
                <th className="w-6 px-1 py-2" />
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleColumnDragEnd}
                  accessibility={{ container: a11yContainer }}
                >
                  <SortableContext items={visibleColumns.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
                    {visibleColumns.map((col, i) => (
                      <SortableColumnHeader
                        key={col.id}
                        col={col}
                        isFirst={i === 0}
                        lockFirstColumn={lockFirstColumn}
                        sortable={columnsSortable}
                        sortState={sort}
                        onCycleSort={cycleSort}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
                <th className="px-2 py-2 w-10 border-r border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => setAddColumnOpen(true)}
                    title="Add column"
                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  >
                    <Plus size={13} />
                  </button>
                </th>
                <th className="w-8" />
              </tr>
            </thead>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleRowDragEnd}
              accessibility={{ container: a11yContainer }}
            >
              <SortableContext items={sorted.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                <tbody>
                  {sorted.map((row, i) => (
                    <SortableRow
                      key={row.id}
                      row={row}
                      nextRowId={sorted[i + 1]?.id}
                      visibleColumns={visibleColumns}
                      colMap={colMap}
                      lockFirstColumn={lockFirstColumn}
                      sortable={rowsSortable}
                      editing={editing}
                      selectOpen={selectOpen}
                      relationOpen={relationOpen}
                      inputRef={inputRef}
                      onStartEdit={startEdit}
                      onCommitEdit={commitEdit}
                      onCancelEdit={() => setEditing(null)}
                      onToggleCheck={toggleCheck}
                      onSetSelect={setSelect}
                      onToggleMulti={toggleMulti}
                      onClearMulti={clearMulti}
                      onToggleRelation={toggleRelation}
                      onCloseSelect={() => setSelectOpen(null)}
                      onCloseRelation={() => setRelationOpen(null)}
                      onDeleteRow={onDeleteRow}
                    />
                  ))}
                </tbody>
              </SortableContext>
            </DndContext>
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

      {addColumnOpen && (
        <PromptModal
          title="New column"
          placeholder="Column name"
          onConfirm={addColumn}
          onCancel={() => setAddColumnOpen(false)}
        />
      )}
    </div>
  )
}

// ─── SortableColumnHeader ──────────────────────────────────────────────────────

interface SortableColumnHeaderProps {
  col: Column
  isFirst: boolean
  lockFirstColumn: boolean
  sortable: boolean
  sortState: SortState
  onCycleSort: (colId: string) => void
}

function SortableColumnHeader({ col, isFirst, lockFirstColumn, sortable, sortState, onCycleSort }: SortableColumnHeaderProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: col.id,
    disabled: !sortable,
  })

  const style = sortable ? { transform: CSS.Transform.toString(transform), transition } : undefined

  return (
    <th
      ref={setNodeRef}
      style={{ ...style, minWidth: col.type === 'checkbox' ? 64 : 160 }}
      className={cn(
        'text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700 last:border-r-0 whitespace-nowrap',
        lockFirstColumn && isFirst && 'sticky left-0 z-30 bg-[#f7f7f5] dark:bg-gray-800',
        isDragging && 'opacity-50 z-40 relative',
      )}
    >
      <div className="flex items-center gap-1 group">
        {sortable && (
          <span
            {...attributes}
            {...listeners}
            className="flex-shrink-0 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 hover:!text-gray-500 dark:hover:!text-gray-400 cursor-grab active:cursor-grabbing touch-none"
          >
            <GripVertical size={12} />
          </span>
        )}
        <button
          onClick={() => onCycleSort(col.id)}
          className="flex items-center gap-1.5 hover:text-gray-900 dark:hover:text-gray-100 transition-colors group/sort"
        >
          <span className="text-gray-400 dark:text-gray-500">{TYPE_ICONS[col.type]}</span>
          {col.name}
          {sortState?.colId === col.id
            ? sortState.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
            : <ArrowUp size={11} className="opacity-0 group-hover/sort:opacity-25" />}
        </button>
      </div>
    </th>
  )
}

// ─── SortableRow ───────────────────────────────────────────────────────────────

interface SortableRowProps {
  row: DbRow
  nextRowId?: string
  visibleColumns: Column[]
  colMap: Map<string, Column>
  lockFirstColumn: boolean
  sortable: boolean
  editing: EditCell
  selectOpen: EditCell
  relationOpen: EditCell
  inputRef: React.RefObject<HTMLInputElement | null>
  onStartEdit: (rowId: string, col: Column) => void
  onCommitEdit: (row: DbRow, colId: string, raw: string) => void
  onCancelEdit: () => void
  onToggleCheck: (row: DbRow, colId: string) => void
  onSetSelect: (row: DbRow, colId: string, value: string) => void
  onToggleMulti: (row: DbRow, colId: string, value: string) => void
  onClearMulti: (row: DbRow, colId: string) => void
  onToggleRelation: (row: DbRow, colId: string, targetRowId: string) => void
  onCloseSelect: () => void
  onCloseRelation: () => void
  onDeleteRow: (rowId: string) => void
}

function SortableRow({
  row, nextRowId, visibleColumns, colMap, lockFirstColumn, sortable, editing, selectOpen, relationOpen, inputRef,
  onStartEdit, onCommitEdit, onCancelEdit, onToggleCheck, onSetSelect, onToggleMulti, onClearMulti,
  onToggleRelation, onCloseSelect, onCloseRelation, onDeleteRow,
}: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    disabled: !sortable,
  })

  const style = sortable ? { transform: CSS.Transform.toString(transform), transition } : undefined

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={cn(
        'border-b border-gray-100 dark:border-gray-800 last:border-b-0 hover:bg-[#fafafa] dark:hover:bg-gray-800/50 group',
        isDragging && 'opacity-50 z-40 relative bg-white dark:bg-gray-900',
      )}
    >
      <td className="w-6 px-1">
        {sortable && (
          <span
            {...attributes}
            {...listeners}
            className="flex-shrink-0 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 hover:!text-gray-500 dark:hover:!text-gray-400 cursor-grab active:cursor-grabbing touch-none"
          >
            <GripVertical size={12} />
          </span>
        )}
      </td>
      {visibleColumns.map((col, i) => (
        <td
          key={col.id}
          className={`px-3 py-2 border-r border-gray-100 dark:border-gray-800 last:border-r-0 cursor-text relative ${
            lockFirstColumn && i === 0
              ? 'sticky left-0 z-10 bg-white dark:bg-gray-900 group-hover:bg-[#fafafa] dark:group-hover:bg-gray-800/50'
              : ''
          }`}
          onClick={() => onStartEdit(row.id, col)}
        >
          {col.type === 'checkbox' ? (
            <input
              type="checkbox"
              checked={!!(getProp(row, col.id) as boolean)}
              onChange={() => onToggleCheck(row, col.id)}
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
                onToggle={(targetRowId) => onToggleRelation(row, col.id, targetRowId)}
                onClose={onCloseRelation}
              />
            </div>
          ) : editing?.rowId === row.id && editing?.colId === col.id ? (
            <input
              ref={inputRef}
              type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
              defaultValue={displayValue(row, col)}
              onBlur={(e) => onCommitEdit(row, col.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  onCommitEdit(row, col.id, (e.target as HTMLInputElement).value)
                  if (nextRowId) onStartEdit(nextRowId, col)
                } else if (e.key === 'Tab' && !e.shiftKey && visibleColumns[i + 1]) {
                  e.preventDefault()
                  onCommitEdit(row, col.id, (e.target as HTMLInputElement).value)
                  onStartEdit(row.id, visibleColumns[i + 1])
                } else if (e.key === 'Escape') {
                  onCancelEdit()
                }
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
                  onSelect={(v) => onSetSelect(row, col.id, v)}
                  onClose={onCloseSelect}
                />
              )}
            </div>
          ) : col.type === 'multi_select' ? (
            <div className="relative">
              <div className="flex flex-wrap gap-1 min-h-[20px]">
                {getMultiSelectValue(row, col.id).map((opt) => (
                  <span key={opt} className={`px-2 py-0.5 rounded text-xs font-medium ${chipColor(col.options ?? [], opt)}`}>{opt}</span>
                ))}
                {!getMultiSelectValue(row, col.id).length && (
                  <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                )}
              </div>
              {selectOpen?.rowId === row.id && selectOpen?.colId === col.id && (
                <OptionDropdown
                  options={col.options ?? []}
                  selected={getMultiSelectValue(row, col.id)}
                  isMulti={true}
                  onToggle={(v) => onToggleMulti(row, col.id, v)}
                  onClear={() => onClearMulti(row, col.id)}
                  onClose={onCloseSelect}
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
