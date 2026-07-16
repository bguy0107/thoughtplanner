'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { type Column, type DbRow, type DbSchema } from '@/lib/api'

interface Props {
  schema: DbSchema
  onUpdateRow: (rowId: string, props: Record<string, unknown>) => void
  onDeleteRow: (rowId: string) => void
  onAddRow: (props?: Record<string, unknown>) => void
}

function getProp(row: DbRow, colId: string): unknown {
  return (row.properties as Record<string, unknown>)[colId]
}

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function CalendarView({ schema, onAddRow, onDeleteRow, onUpdateRow }: Props) {
  const [current, setCurrent] = useState<Date>(() => monthStart(new Date()))
  const [editingRow, setEditingRow] = useState<{ rowId: string; colId: string; value: string } | null>(null)

  const dateCol: Column | undefined = schema.columns.find((c) => c.type === 'date')
  const nameCol: Column = schema.columns[0]

  if (!dateCol) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <p className="text-base">Calendar view requires a Date column.</p>
        <p className="text-sm mt-1">Add a Date column in Properties to use this view.</p>
      </div>
    )
  }

  // Build a map: YYYY-MM-DD → DbRow[]
  const rowsByDate: Record<string, DbRow[]> = {}
  for (const row of schema.rows) {
    const v = getProp(row, dateCol.id)
    if (typeof v === 'string' && v) {
      const ymd = v.slice(0, 10)
      if (!rowsByDate[ymd]) rowsByDate[ymd] = []
      rowsByDate[ymd].push(row)
    }
  }

  // Build calendar grid
  const firstDay = current.getDay() // 0=Sun
  const daysInMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate()
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7
  const today = toYMD(new Date())

  const cells: Array<{ date: Date; ymd: string } | null> = Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - firstDay + 1
    if (dayNum < 1 || dayNum > daysInMonth) return null
    const date = new Date(current.getFullYear(), current.getMonth(), dayNum)
    return { date, ymd: toYMD(date) }
  })

  function handleDayClick(ymd: string) {
    onAddRow({ [dateCol!.id]: ymd })
  }

  function commitEdit() {
    if (!editingRow) return
    onUpdateRow(editingRow.rowId, {
      ...(schema.rows.find((r) => r.id === editingRow.rowId)?.properties as Record<string, unknown> ?? {}),
      [editingRow.colId]: editingRow.value,
    })
    setEditingRow(null)
  }

  return (
    <div className="select-none">
      {/* Nav */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => setCurrent((c) => addMonths(c, -1))}
          className="p-1 rounded hover:bg-gray-100 text-gray-600"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-base font-semibold text-gray-800 w-36 text-center">
          {MONTH_NAMES[current.getMonth()]} {current.getFullYear()}
        </span>
        <button
          onClick={() => setCurrent((c) => addMonths(c, 1))}
          className="p-1 rounded hover:bg-gray-100 text-gray-600"
        >
          <ChevronRight size={16} />
        </button>
        <button
          onClick={() => setCurrent(monthStart(new Date()))}
          className="ml-2 px-2 py-0.5 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
        >
          Today
        </button>
      </div>

      {/* Grid */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2 text-center text-xs font-medium text-gray-500">
              {d}
            </div>
          ))}
        </div>

        {/* Weeks */}
        <div className="grid grid-cols-7">
          {cells.map((cell, i) => {
            if (!cell) {
              return (
                <div
                  key={i}
                  className="min-h-[100px] border-b border-r border-gray-100 bg-gray-50 last:border-r-0"
                />
              )
            }
            const { ymd } = cell
            const dayRows = rowsByDate[ymd] ?? []
            const isToday = ymd === today
            const isLastRow = i >= totalCells - 7
            const isLastCol = (i + 1) % 7 === 0

            return (
              <div
                key={ymd}
                className={`min-h-[100px] p-1.5 flex flex-col gap-1 border-gray-100 ${
                  isLastRow ? '' : 'border-b'
                } ${isLastCol ? '' : 'border-r'} group`}
              >
                {/* Day number */}
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${
                      isToday
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-500'
                    }`}
                  >
                    {cell.date.getDate()}
                  </span>
                  <button
                    onClick={() => handleDayClick(ymd)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-200 text-gray-400 transition-opacity"
                    title="Add row"
                  >
                    <Plus size={12} />
                  </button>
                </div>

                {/* Row chips */}
                {dayRows.map((row) => {
                  const name = getProp(row, nameCol.id)
                  const label = typeof name === 'string' && name ? name : 'Untitled'

                  if (editingRow?.rowId === row.id) {
                    return (
                      <input
                        key={row.id}
                        autoFocus
                        value={editingRow.value}
                        onChange={(e) =>
                          setEditingRow((ev) => ev ? { ...ev, value: e.target.value } : ev)
                        }
                        onBlur={commitEdit}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitEdit()
                          if (e.key === 'Escape') setEditingRow(null)
                        }}
                        className="w-full text-xs px-1.5 py-0.5 rounded bg-blue-50 border border-blue-300 outline-none"
                      />
                    )
                  }

                  return (
                    <div
                      key={row.id}
                      onClick={() =>
                        setEditingRow({ rowId: row.id, colId: nameCol.id, value: label })
                      }
                      className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 truncate cursor-pointer hover:bg-blue-200 transition-colors"
                      title={label}
                    >
                      {label}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
