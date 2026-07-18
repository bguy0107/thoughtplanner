'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Archive } from 'lucide-react'
import { api, type AdminDatabase } from '@/lib/api'

export function DatabasesPanel() {
  const [databases, setDatabases] = useState<AdminDatabase[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.admin.databases.list().then(setDatabases).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="py-8 flex justify-center">
        <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-gray-600 dark:border-t-gray-300 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-1">Databases</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Every database page in the workspace, with its size and owner.
      </p>

      {databases.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 py-4">No databases yet.</p>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          {databases.map((db) => (
            <Link
              key={db.id}
              href={`/page/${db.id}`}
              className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate flex items-center gap-1.5">
                  {db.icon && <span>{db.icon}</span>}
                  {db.title}
                  {db.isArchived && (
                    <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                      <Archive size={10} /> Archived
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {db.workspaceName} · Owned by {db.createdBy.name} · {db.columnCount} columns · {db.rowCount} rows · Updated{' '}
                  {new Date(db.updatedAt).toLocaleDateString()}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
