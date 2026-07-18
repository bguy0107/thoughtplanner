'use client'

import { useEffect, useState } from 'react'
import { UserPlus, Trash2 } from 'lucide-react'
import { useSession } from '@/lib/auth-client'
import { api, type WorkspaceMember, type WorkspaceRole } from '@/lib/api'
import { useWorkspaceStore } from '@/store/workspace'

const ROLES: WorkspaceRole[] = ['ADMIN', 'EDITOR', 'VIEWER']

export function WorkspaceMembersPanel() {
  const { data: session } = useSession()
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId)
  const currentRole = useWorkspaceStore((s) => s.currentRole())

  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<WorkspaceRole>('EDITOR')
  const [error, setError] = useState<string | null>(null)

  const isAdmin = currentRole === 'ADMIN'

  async function load() {
    if (!currentWorkspaceId) return
    setMembers(await api.workspaces.members.list(currentWorkspaceId))
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [currentWorkspaceId])

  async function handleAdd() {
    if (!currentWorkspaceId || !email.trim()) return
    setError(null)
    try {
      await api.workspaces.members.add(currentWorkspaceId, { email: email.trim(), role })
      setEmail('')
      setAdding(false)
      await load()
    } catch (e) {
      setError(String(e))
    }
  }

  async function handleRoleChange(memberId: string, newRole: WorkspaceRole) {
    if (!currentWorkspaceId) return
    try {
      await api.workspaces.members.setRole(currentWorkspaceId, memberId, newRole)
      await load()
    } catch (e) {
      setError(String(e))
    }
  }

  async function handleRemove(memberId: string) {
    if (!currentWorkspaceId) return
    try {
      await api.workspaces.members.remove(currentWorkspaceId, memberId)
      await load()
    } catch (e) {
      setError(String(e))
    }
  }

  if (loading) {
    return (
      <div className="py-8 flex justify-center">
        <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-gray-600 dark:border-t-gray-300 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Members</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Who can access this workspace, and what they can do in it.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-900 text-white rounded hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300 transition-colors"
          >
            <UserPlus size={14} /> Add member
          </button>
        )}
      </div>

      {adding && (
        <div className="flex gap-2 mb-4">
          <input
            autoFocus
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd()
              if (e.key === 'Escape') setAdding(false)
            }}
            placeholder="person@example.com"
            className="flex-1 text-sm border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-300 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as WorkspaceRole)}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-300 dark:bg-gray-800 dark:text-gray-100"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={!email.trim()}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            Add
          </button>
          <button
            onClick={() => setAdding(false)}
            className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400 mb-4">{error}</p>}

      <div className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        {members.map((member) => {
          const isSelf = member.userId === session?.user.id
          return (
            <div key={member.id} className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                  {member.user.name}
                  {isSelf && <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">(you)</span>}
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500 truncate">{member.user.email}</div>
              </div>
              <select
                value={member.role}
                disabled={!isAdmin}
                onChange={(e) => handleRoleChange(member.id, e.target.value as WorkspaceRole)}
                className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-blue-300 dark:bg-gray-800 dark:text-gray-100 disabled:opacity-40"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              {(isAdmin || isSelf) && (
                <button
                  onClick={() => handleRemove(member.id)}
                  title={isSelf ? 'Leave workspace' : 'Remove member'}
                  className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
