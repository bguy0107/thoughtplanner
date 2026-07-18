'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronsUpDown, Plus, Check } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace'
import { CreateWorkspaceModal } from './CreateWorkspaceModal'

export function WorkspaceSwitcher({ accountName }: { accountName?: string }) {
  const router = useRouter()
  const { workspaces, currentWorkspaceId, switchWorkspace } = useWorkspaceStore()
  const [open, setOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const current = workspaces.find((w) => w.id === currentWorkspaceId)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  function handleSwitch(id: string) {
    setOpen(false)
    if (id === currentWorkspaceId) return
    switchWorkspace(id)
    router.push('/home')
  }

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-[#ebebea] dark:hover:bg-sidebar-dark-hover transition-colors text-left"
      >
        <span className="flex-shrink-0 text-base leading-none">{current?.icon || '🗂️'}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-gray-700 dark:text-sidebar-dark-text truncate">
            {current?.name ?? 'Workspace'}
          </span>
          {accountName && (
            <span className="block text-xs text-gray-400 dark:text-sidebar-dark-muted truncate">{accountName}</span>
          )}
        </span>
        <ChevronsUpDown size={14} className="flex-shrink-0 text-gray-400 dark:text-sidebar-dark-muted" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 mt-1 z-30 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 max-h-80 overflow-y-auto">
          {workspaces.map((w) => (
            <button
              key={w.id}
              onClick={() => handleSwitch(w.id)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <span className="flex-shrink-0 text-base leading-none">{w.icon || '🗂️'}</span>
              <span className="flex-1 min-w-0 truncate text-gray-800 dark:text-gray-200">{w.name}</span>
              <span className="flex-shrink-0 text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
                {w.role}
              </span>
              {w.id === currentWorkspaceId && <Check size={13} className="flex-shrink-0 text-gray-500 dark:text-gray-400" />}
            </button>
          ))}
          <div className="border-t border-gray-100 dark:border-gray-800 mt-1 pt-1">
            <button
              onClick={() => { setOpen(false); setCreateOpen(true) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <Plus size={14} />
              New workspace
            </button>
          </div>
        </div>
      )}

      {createOpen && (
        <CreateWorkspaceModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            useWorkspaceStore.getState().fetchWorkspaces()
          }}
        />
      )}
    </div>
  )
}
