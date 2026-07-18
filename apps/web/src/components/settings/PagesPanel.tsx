'use client'

import { useEffect, useState } from 'react'
import { RotateCcw, Trash2, Archive } from 'lucide-react'
import { api, type AdminPage } from '@/lib/api'

export function PagesPanel() {
  const [pages, setPages] = useState<AdminPage[]>([])
  const [loading, setLoading] = useState(true)
  const [showArchivedOnly, setShowArchivedOnly] = useState(false)

  async function load() {
    setPages(await api.admin.pages.list())
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [])

  async function handleRestore(id: string) {
    await api.admin.pages.restore(id)
    await load()
  }

  async function handlePurge(id: string, title: string) {
    if (!confirm(`Permanently delete "${title}" and all its sub-pages? This cannot be undone.`)) return
    await api.admin.pages.purge(id)
    await load()
  }

  if (loading) {
    return (
      <div className="py-8 flex justify-center">
        <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-gray-600 dark:border-t-gray-300 rounded-full animate-spin" />
      </div>
    )
  }

  const visible = showArchivedOnly ? pages.filter((p) => p.isArchived) : pages

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">All pages</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Workspace-wide view, including archived pages.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <input
            type="checkbox"
            checked={showArchivedOnly}
            onChange={(e) => setShowArchivedOnly(e.target.checked)}
          />
          Archived only
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 py-4">No pages.</p>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          {visible.map((page) => (
            <div key={page.id} className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate flex items-center gap-1.5">
                  {page.icon && <span>{page.icon}</span>}
                  {page.title}
                  {page.isArchived && (
                    <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                      <Archive size={10} /> Archived
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {page.workspace.name} · Owned by {page.createdBy.name} · Updated {new Date(page.updatedAt).toLocaleDateString()}
                </div>
              </div>
              {page.isArchived && (
                <>
                  <button
                    onClick={() => handleRestore(page.id)}
                    className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-green-600 dark:hover:text-green-400"
                    title="Restore"
                  >
                    <RotateCcw size={14} />
                  </button>
                  <button
                    onClick={() => handlePurge(page.id, page.title)}
                    className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-500"
                    title="Permanently delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
