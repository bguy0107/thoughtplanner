'use client'

import { useState } from 'react'

interface Props {
  title: string
  placeholder?: string
  confirmLabel?: string
  onConfirm: (value: string) => void
  onCancel: () => void
}

export function PromptModal({ title, placeholder, confirmLabel = 'Create', onConfirm, onCancel }: Props) {
  const [value, setValue] = useState('')

  function submit() {
    if (!value.trim()) return
    onConfirm(value.trim())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onCancel}>
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-sm p-6 m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4">{title}</h2>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') onCancel()
          }}
          placeholder={placeholder}
          className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-300 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!value.trim()}
            className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300 disabled:opacity-40 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
