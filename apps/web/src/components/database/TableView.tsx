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
import { resolveInsertPosition } from '@/lib/position'
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

export const OPTION_COLOR_NAMES = ['blue', 'green', 'yellow', 'purple', 'red', 'orange', 'pink', 'teal'] as const
export type OptionColorName = typeof OPTION_COLOR_NAMES[number]

const CHIP_COLOR_CLASSES: Record<OptionColorName, string> = {
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
  green: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300',
  yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-300',
  purple: 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300',
  red: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300',
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300',
  pink: 'bg-pink-100 text-pink-700 dark:bg-pink-950/50 dark:text-pink-300',
  teal: 'bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300',
}

// Solid swatch classes for the color picker — kept as static literals (not
// built from the name via a template string) so Tailwind's static analysis
// can see and keep them.
export const OPTION_SWATCH_CLASSES: Record<OptionColorName, string> = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  purple: 'bg-purple-500',
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  pink: 'bg-pink-500',
  teal: 'bg-teal-500',
}

function isOptionColorName(name: string | undefined): name is OptionColorName {
  return !!name && (OPTION_COLOR_NAMES as readonly string[]).includes(name)
}

// The color an option resolves to: an explicit user-picked color if set,
// otherwise the auto-assigned color based on the option's position in the
// list (so uncustomized options keep spreading across the palette instead of
// all defaulting to the same color).
export function optionColorName(options: string[], value: string, optionColors?: Record<string, string>): OptionColorName {
  const chosen = optionColors?.[value]
  if (isOptionColorName(chosen)) return chosen
  const i = options.indexOf(value)
  return OPTION_COLOR_NAMES[i < 0 ? 0 : i % OPTION_COLOR_NAMES.length]
}

export function chipColor(options: string[], value: string, optionColors?: Record<string, string>) {
  return CHIP_COLOR_CLASSES[optionColorName(options, value, optionColors)]
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
  const [selected, setSelected] = useState<EditCell>(null)
  const [selectOpen, setSelectOpen] = useState<EditCell>(null)
  const [relationOpen, setRelationOpen] = useState<EditCell>(null)
  const [sort, setSort] = useState<SortState>(null)
  const [filter, setFilter] = useState('')
  const [columnFilter, setColumnFilter] = useState('')
  const [lockHeaders, setLockHeaders] = useState(true)
  const [lockFirstColumn, setLockFirstColumn] = useState(false)
  const [addColumnOpen, setAddColumnOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // Keyed by `${rowId}:${colId}` — lets arrow-key navigation move native DOM
  // focus to an arbitrary cell without each SortableRow needing its own state.
  const cellRefs = useRef(new Map<string, HTMLTableCellElement>())

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
    () =>
      schema.columns.filter((col, i) => {
        if (lockFirstColumn && i === 0) return true
        return col.name.toLowerCase().includes(columnFilter.toLowerCase())
      }),
    [schema.columns, columnFilter, lockFirstColumn],
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
    setSelected({ rowId, colId: col.id })
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

  function selectCell(rowId: string, colId: string) {
    setSelected({ rowId, colId })
    // Focus landing on a different cell means navigation moved away from whichever
    // cell had a select/relation dropdown open — the outside-mousedown listeners in
    // OptionDropdown/RelationCell don't fire for keyboard-driven focus changes (e.g.
    // Tab), so close explicitly here too.
    setSelectOpen((cur) => (cur && (cur.rowId !== rowId || cur.colId !== colId) ? null : cur))
    setRelationOpen((cur) => (cur && (cur.rowId !== rowId || cur.colId !== colId) ? null : cur))
  }

  // Moves native focus to the target cell rather than just updating state —
  // the target <td>'s onFocus is what actually updates `selected`, so this
  // stays the single source of truth for "which cell is current."
  function focusCell(rowId: string, colId: string) {
    cellRefs.current.get(`${rowId}:${colId}`)?.focus()
  }

  // Steps one column left/right, wrapping to the first/last column of the
  // next/previous row at a row boundary — null only past the very first or
  // last cell of the whole table.
  function stepHorizontal(rowIdx: number, colIdx: number, dir: 1 | -1): { row: DbRow; col: Column } | null {
    let r = rowIdx
    let c = colIdx + dir
    if (c >= visibleColumns.length) { c = 0; r += 1 }
    else if (c < 0) { c = visibleColumns.length - 1; r -= 1 }
    if (r < 0 || r >= sorted.length) return null
    return { row: sorted[r], col: visibleColumns[c] }
  }

  // Falls back to the origin cell when a move would go past the table edge —
  // arrows/Tab clamp there rather than losing focus entirely.
  function moveHorizontal(rowId: string, colId: string, dir: 1 | -1) {
    const rowIdx = sorted.findIndex((r) => r.id === rowId)
    const colIdx = visibleColumns.findIndex((c) => c.id === colId)
    if (rowIdx === -1 || colIdx === -1) return
    const next = stepHorizontal(rowIdx, colIdx, dir)
    focusCell(next ? next.row.id : rowId, next ? next.col.id : colId)
  }

  // Vertical movement clamps at the top/bottom row — no wrap, unlike horizontal.
  function moveVertical(rowId: string, colId: string, dir: 1 | -1) {
    const rowIdx = sorted.findIndex((r) => r.id === rowId)
    const colIdx = visibleColumns.findIndex((c) => c.id === colId)
    if (rowIdx === -1 || colIdx === -1) return
    const newRow = sorted[rowIdx + dir]
    focusCell(newRow ? newRow.id : rowId, visibleColumns[colIdx].id)
  }

  // Commits the in-progress edit and lands on the destination cell in
  // navigation mode (selected, not editing) — never re-enters edit mode
  // automatically, matching Enter/Tab's spreadsheet-style "confirm and move."
  function moveAfterEdit(row: DbRow, colId: string, raw: string, dir: 'down' | 'left' | 'right') {
    commitEdit(row, colId, raw) // its own guard already nulls `editing` for this cell
    if (dir === 'down') moveVertical(row.id, colId, 1)
    else moveHorizontal(row.id, colId, dir === 'right' ? 1 : -1)
  }

  // Unmounting the editing <input> doesn't hand focus back to its containing
  // <td> automatically — the browser drops it to <body>. Refocus explicitly so
  // Escape leaves you in navigation mode on the same cell, not focus-less.
  function cancelEdit() {
    const cell = editing
    setEditing(null)
    if (cell) focusCell(cell.rowId, cell.colId)
  }

  function clearCell(row: DbRow, col: Column) {
    if (col.type === 'rollup') return
    const empty = col.type === 'checkbox' ? false : col.type === 'multi_select' || col.type === 'relation' ? [] : null
    onUpdateRow(row.id, { [col.id]: empty })
  }

  // Only fires for a cell that's merely selected (navigation mode), not the one
  // currently being edited (SortableRow guards that) — an open input/dropdown
  // handles its own keys.
  function handleCellKeyDown(e: React.KeyboardEvent, row: DbRow, col: Column) {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      moveVertical(row.id, col.id, -1)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      moveVertical(row.id, col.id, 1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      moveHorizontal(row.id, col.id, -1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      moveHorizontal(row.id, col.id, 1)
    } else if (e.key === 'Tab') {
      // Tab (and Shift+Tab) move like arrow-right/left but wrap at row ends —
      // the same "next cell" semantics as Tab already has while editing.
      e.preventDefault()
      moveHorizontal(row.id, col.id, e.shiftKey ? -1 : 1)
    } else if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault()
      if (col.type === 'checkbox') toggleCheck(row, col.id) // startEdit no-ops on checkbox columns
      else startEdit(row.id, col)
    } else if (e.key === ' ' && col.type === 'checkbox') {
      e.preventDefault()
      toggleCheck(row, col.id)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      clearCell(row, col)
    } else if (e.key === 'Escape') {
      // A second Escape (first one, while editing, just cancels the edit and
      // stays in navigation mode) exits navigation mode entirely.
      e.preventDefault()
      setSelected(null)
      ;(document.activeElement as HTMLElement | null)?.blur()
    }
  }

  function commitEdit(row: DbRow, colId: string, raw: string) {
    const col = colMap.get(colId)
    if (!col) return
    // An empty/non-numeric input means "cleared", not zero — parseFloat('') || 0
    // silently turned a blanked-out cell into an explicit 0.
    const value = col.type === 'number' ? (raw.trim() === '' ? null : (Number.isNaN(parseFloat(raw)) ? null : parseFloat(raw))) : raw
    onUpdateRow(row.id, { [colId]: value })
    // Only clear if this is still the active cell — Tab/Enter navigation commits
    // and immediately re-targets `editing` to the next cell in the same handler,
    // and the outgoing input's native blur (fired on unmount) must not clobber that.
    setEditing((cur) => (cur?.rowId === row.id && cur?.colId === colId ? null : cur))
  }

  function toggleCheck(row: DbRow, colId: string) {
    const cur = getProp(row, colId) as boolean | null
    onUpdateRow(row.id, { [colId]: !cur })
  }

  function setSelect(row: DbRow, colId: string, value: string) {
    onUpdateRow(row.id, { [colId]: value })
    setSelectOpen(null)
  }

  function toggleMulti(row: DbRow, colId: string, value: string) {
    const cur = (getProp(row, colId) as string[] | null) ?? []
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]
    onUpdateRow(row.id, { [colId]: next })
  }

  function clearMulti(row: DbRow, colId: string) {
    onUpdateRow(row.id, { [colId]: [] })
    setSelectOpen(null)
  }

  function toggleRelation(row: DbRow, colId: string, targetRowId: string) {
    const cur = (getProp(row, colId) as string[] | null) ?? []
    const next = cur.includes(targetRowId) ? cur.filter((v) => v !== targetRowId) : [...cur, targetRowId]
    onUpdateRow(row.id, { [colId]: next })
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
    // between its new neighbors keeps every other row untouched. If that gap
    // has been halved past float64 precision (e.g. many drops onto the same
    // slot over time), resolveInsertPosition instead renumbers every sibling
    // with fresh integer gaps — persist those too, not just the moved row.
    const reordered = arrayMove(sorted, oldIndex, newIndex)
    const movedIndex = reordered.findIndex((r) => r.id === active.id)
    const siblings = reordered.filter((_, i) => i !== movedIndex).map((r) => ({ id: r.id, position: r.position }))
    const { position, rebalanced } = resolveInsertPosition(siblings, movedIndex)
    rebalanced?.forEach((s) => onReorderRow(s.id, s.position))
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
          <table
            className="w-full border-collapse text-sm"
            onBlur={(e) => {
              // Focus moved somewhere outside the table entirely (filter box, a
              // button, another page) — exit navigation mode. Focus moving between
              // cells/inputs/dropdowns within the table itself stays contained.
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSelected(null)
            }}
          >
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
                        isSelectedCol={selected?.colId === col.id}
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
                  {sorted.map((row) => (
                    <SortableRow
                      key={row.id}
                      row={row}
                      visibleColumns={visibleColumns}
                      colMap={colMap}
                      lockFirstColumn={lockFirstColumn}
                      sortable={rowsSortable}
                      editing={editing}
                      selected={selected}
                      selectOpen={selectOpen}
                      relationOpen={relationOpen}
                      inputRef={inputRef}
                      cellRefs={cellRefs}
                      onStartEdit={startEdit}
                      onSelectCell={selectCell}
                      onCellKeyDown={handleCellKeyDown}
                      onCommitEdit={commitEdit}
                      onMoveAfterEdit={moveAfterEdit}
                      onCancelEdit={cancelEdit}
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
  isSelectedCol: boolean
  onCycleSort: (colId: string) => void
}

function SortableColumnHeader({ col, isFirst, lockFirstColumn, sortable, sortState, isSelectedCol, onCycleSort }: SortableColumnHeaderProps) {
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
        isSelectedCol && 'bg-blue-50 dark:bg-blue-950/40',
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
  visibleColumns: Column[]
  colMap: Map<string, Column>
  lockFirstColumn: boolean
  sortable: boolean
  editing: EditCell
  selected: EditCell
  selectOpen: EditCell
  relationOpen: EditCell
  inputRef: React.RefObject<HTMLInputElement | null>
  cellRefs: React.RefObject<Map<string, HTMLTableCellElement>>
  onStartEdit: (rowId: string, col: Column) => void
  onSelectCell: (rowId: string, colId: string) => void
  onCellKeyDown: (e: React.KeyboardEvent, row: DbRow, col: Column) => void
  onCommitEdit: (row: DbRow, colId: string, raw: string) => void
  onMoveAfterEdit: (row: DbRow, colId: string, raw: string, dir: 'down' | 'left' | 'right') => void
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
  row, visibleColumns, colMap, lockFirstColumn, sortable, editing, selected, selectOpen, relationOpen,
  inputRef, cellRefs, onStartEdit, onSelectCell, onCellKeyDown, onCommitEdit, onMoveAfterEdit, onCancelEdit,
  onToggleCheck, onSetSelect, onToggleMulti, onClearMulti, onToggleRelation, onCloseSelect, onCloseRelation, onDeleteRow,
}: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    disabled: !sortable,
  })

  const style = sortable ? { transform: CSS.Transform.toString(transform), transition } : undefined
  const isSelectedRow = selected?.rowId === row.id

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={cn(
        'border-b border-gray-100 dark:border-gray-800 last:border-b-0 hover:bg-[#fafafa] dark:hover:bg-gray-800/50 group',
        isDragging && 'opacity-50 z-40 relative bg-white dark:bg-gray-900',
      )}
    >
      <td className={cn('w-6 px-1', isSelectedRow && 'bg-blue-50 dark:bg-blue-950/40')}>
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
      {visibleColumns.map((col, i) => {
        const isEditingCell = editing?.rowId === row.id && editing?.colId === col.id
        const isSelectedCell = selected?.rowId === row.id && selected?.colId === col.id
        const isSelectedCol = selected?.colId === col.id
        const isDropdownOpenForCell =
          (selectOpen?.rowId === row.id && selectOpen?.colId === col.id) ||
          (relationOpen?.rowId === row.id && relationOpen?.colId === col.id)
        return (
        <td
          key={col.id}
          ref={(el) => {
            const key = `${row.id}:${col.id}`
            if (el) cellRefs.current.set(key, el)
            else cellRefs.current.delete(key)
          }}
          tabIndex={0}
          className={cn(
            'px-3 py-2 border-r border-gray-100 dark:border-gray-800 last:border-r-0 cursor-text relative outline-none',
            lockFirstColumn && i === 0 && 'sticky left-0 z-10 bg-white dark:bg-gray-900 group-hover:bg-[#fafafa] dark:group-hover:bg-gray-800/50',
            (isSelectedRow || isSelectedCol) && 'bg-blue-50 dark:bg-blue-950/40',
            isSelectedCell && !isEditingCell && 'ring-2 ring-inset ring-blue-400 dark:ring-blue-500',
          )}
          onFocus={() => onSelectCell(row.id, col.id)}
          onClick={() => onStartEdit(row.id, col)}
          onKeyDown={(e) => {
            if (!isEditingCell && !isDropdownOpenForCell) onCellKeyDown(e, row, col)
          }}
        >
          {col.type === 'checkbox' ? (
            <input
              type="checkbox"
              tabIndex={-1}
              checked={!!(getProp(row, col.id) as boolean)}
              // preventDefault on mousedown stops the checkbox itself from stealing focus
              // (its own click/change toggle still fires normally) — we want DOM focus to
              // land on the containing <td> instead, so arrow-key nav keeps working from here.
              onMouseDown={(e) => e.preventDefault()}
              onChange={() => {
                onToggleCheck(row, col.id)
                cellRefs.current.get(`${row.id}:${col.id}`)?.focus()
              }}
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
                  onMoveAfterEdit(row, col.id, (e.target as HTMLInputElement).value, 'down')
                } else if (e.key === 'Tab') {
                  e.preventDefault()
                  onMoveAfterEdit(row, col.id, (e.target as HTMLInputElement).value, e.shiftKey ? 'left' : 'right')
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
                ? <span className={`px-2 py-0.5 rounded text-xs font-medium ${chipColor(col.options ?? [], getProp(row, col.id) as string, col.optionColors)}`}>{getProp(row, col.id) as string}</span>
                : <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>}
              {selectOpen?.rowId === row.id && selectOpen?.colId === col.id && (
                <OptionDropdown
                  options={col.options ?? []}
                  optionColors={col.optionColors}
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
                  <span key={opt} className={`px-2 py-0.5 rounded text-xs font-medium ${chipColor(col.options ?? [], opt, col.optionColors)}`}>{opt}</span>
                ))}
                {!getMultiSelectValue(row, col.id).length && (
                  <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                )}
              </div>
              {selectOpen?.rowId === row.id && selectOpen?.colId === col.id && (
                <OptionDropdown
                  options={col.options ?? []}
                  optionColors={col.optionColors}
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
        )
      })}
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
  optionColors?: Record<string, string>
  selected: string[]
  isMulti: boolean
  onSelect?: (value: string) => void
  onToggle?: (value: string) => void
  onClear?: () => void
  onClose: () => void
}

function OptionDropdown({ options, optionColors, selected, isMulti, onSelect, onToggle, onClear, onClose }: OptionDropdownProps) {
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
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${chipColor(options, opt, optionColors)}`}>{opt}</span>
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
