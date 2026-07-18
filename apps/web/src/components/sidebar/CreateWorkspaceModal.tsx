'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { api } from '@/lib/api'
import { useWorkspaceStore } from '@/store/workspace'

interface Props {
  onClose: () => void
  onCreated: () => void
}

export function CreateWorkspaceModal({ onClose, onCreated }: Props) {
  const switchWorkspace = useWorkspaceStore((s) => s.switchWorkspace)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!name.trim()) return
    setCreating(true)
    setError(null)
    try {
      const workspace = await api.workspaces.create({ name: name.trim(), icon: icon.trim() || undefined })
      switchWorkspace(workspace.id)
      onCreated()
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-sm p-6 m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">New workspace</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-500">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="🗂️"
              maxLength={4}
              className="w-14 text-center text-lg border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-300 dark:bg-gray-800"
            />
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="Workspace name"
              className="flex-1 text-sm border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-300 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
            />
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!name.trim() || creating}
              className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300 disabled:opacity-40 transition-colors"
            >
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
