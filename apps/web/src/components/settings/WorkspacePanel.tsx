'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useWorkspaceStore } from '@/store/workspace'
import { ConfirmModal } from '@/components/ui/ConfirmModal'

export function WorkspacePanel() {
  const router = useRouter()
  const { currentWorkspaceId, workspaces, fetchWorkspaces } = useWorkspaceStore()
  const current = workspaces.find((w) => w.id === currentWorkspaceId)

  const [name, setName] = useState('')
  const [icon, setIcon] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    setName(current?.name ?? '')
    setIcon(current?.icon ?? '')
  }, [current?.id, current?.name, current?.icon])

  async function handleSave() {
    if (!currentWorkspaceId || !name.trim()) return
    setSaving(true)
    setSaved(false)
    try {
      await api.workspaces.update(currentWorkspaceId, { name: name.trim(), icon: icon.trim() || null })
      await fetchWorkspaces()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!currentWorkspaceId) return
    setConfirmOpen(false)
    setDeleting(true)
    setDeleteError(null)
    try {
      await api.workspaces.delete(currentWorkspaceId)
      await fetchWorkspaces()
      router.push('/home')
    } catch (e) {
      setDeleteError(String(e))
    } finally {
      setDeleting(false)
    }
  }

  if (!current) return null

  const isAdmin = current.role === 'ADMIN'

  return (
    <div>
      <section className="mb-10">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4">Workspace</h2>
        <div className="flex gap-2 mb-2">
          <input
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            disabled={!isAdmin}
            placeholder="🗂️"
            maxLength={4}
            className="w-14 text-center text-lg border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-300 dark:bg-gray-800 disabled:opacity-50"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!isAdmin}
            placeholder="Workspace name"
            className="flex-1 text-sm border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-300 dark:bg-gray-800 dark:text-gray-100 disabled:opacity-50"
          />
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300 disabled:opacity-40 transition-colors"
            >
              Save
            </button>
            {saved && <span className="text-sm text-green-600 dark:text-green-400">Saved</span>}
          </div>
        )}
        {!isAdmin && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Only workspace admins can rename this workspace.</p>
        )}
      </section>

      {isAdmin && (
        <section>
          <h2 className="text-base font-semibold text-red-600 dark:text-red-400 mb-2">Danger zone</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            Deleting a workspace is permanent. Archive or delete every page in it first.
          </p>
          {deleteError && <p className="text-sm text-red-600 dark:text-red-400 mb-2">{deleteError}</p>}
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={deleting}
            className="px-3 py-1.5 text-sm border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 rounded hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40 transition-colors"
          >
            Delete workspace
          </button>
        </section>
      )}

      {confirmOpen && (
        <ConfirmModal
          title="Delete workspace?"
          message={`Delete "${current?.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  )
}
