'use client'

import { useEffect, useState } from 'react'
import { Copy, Check, Trash2, UserPlus, Ban, RotateCcw } from 'lucide-react'
import { authClient, useSession } from '@/lib/auth-client'
import { api, type Invite, type InviteCreated, type UserRole } from '@/lib/api'

type AdminUser = {
  id: string
  name: string
  email: string
  role?: string | null
  banned?: boolean | null
}

const ROLES: UserRole[] = ['ADMIN', 'EDITOR', 'VIEWER']

export function UsersPanel() {
  const { data: session } = useSession()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [inviting, setInviting] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<UserRole>('EDITOR')
  const [created, setCreated] = useState<InviteCreated | null>(null)
  const [copied, setCopied] = useState(false)

  async function loadUsers() {
    const result = await authClient.admin.listUsers({ query: { limit: 200 } })
    setUsers((result.data?.users as AdminUser[]) ?? [])
  }

  async function loadInvites() {
    setInvites(await api.invites.list())
  }

  useEffect(() => {
    Promise.all([loadUsers(), loadInvites()]).finally(() => setLoading(false))
  }, [])

  async function handleRoleChange(userId: string, role: UserRole) {
    // better-auth's admin client types `role` against its own default "admin"/"user"
    // roles; we reuse the app's ADMIN/EDITOR/VIEWER strings instead of adopting
    // better-auth's access-control system, so the value is cast at this boundary.
    await authClient.admin.setRole({ userId, role: role as never })
    await loadUsers()
  }

  async function handleBanToggle(user: AdminUser) {
    if (user.banned) {
      await authClient.admin.unbanUser({ userId: user.id })
    } else {
      await authClient.admin.banUser({ userId: user.id })
    }
    await loadUsers()
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) return
    const result = await api.invites.create(inviteEmail.trim(), inviteRole)
    setCreated(result)
    setInviteEmail('')
    setInviting(false)
    setCopied(false)
    await loadInvites()
  }

  async function handleRevoke(id: string) {
    await api.invites.delete(id)
    setInvites((i) => i.filter((inv) => inv.id !== id))
  }

  function inviteUrl(token: string) {
    return `${window.location.origin}/signup?invite=${token}`
  }

  function copyLink(token: string) {
    navigator.clipboard.writeText(inviteUrl(token))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const pendingInvites = invites.filter((i) => !i.usedAt)

  if (loading) {
    return (
      <div className="py-8 flex justify-center">
        <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-gray-600 dark:border-t-gray-300 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      {/* Members */}
      <div className="mb-10">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4">Members</h2>
        <div className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          {users.map((user) => (
            <div key={user.id} className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                  {user.name}
                  {user.id === session?.user.id && (
                    <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">(you)</span>
                  )}
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500 truncate">{user.email}</div>
              </div>
              {user.banned && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400">
                  Disabled
                </span>
              )}
              <select
                value={user.role ?? 'EDITOR'}
                disabled={user.id === session?.user.id}
                onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-blue-300 dark:bg-gray-800 dark:text-gray-100 disabled:opacity-40"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <button
                onClick={() => handleBanToggle(user)}
                disabled={user.id === session?.user.id}
                title={user.banned ? 'Reactivate' : 'Deactivate'}
                className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-500 disabled:opacity-30 disabled:hover:text-gray-400"
              >
                {user.banned ? <RotateCcw size={14} /> : <Ban size={14} />}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Invites */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Invites</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Generate a single-use link to bring a new member into the workspace.
            </p>
          </div>
          <button
            onClick={() => setInviting(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-900 text-white rounded hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300 transition-colors"
          >
            <UserPlus size={14} /> Invite
          </button>
        </div>

        {inviting && (
          <div className="flex gap-2 mb-4">
            <input
              autoFocus
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleInvite()
                if (e.key === 'Escape') setInviting(false)
              }}
              placeholder="person@example.com"
              className="flex-1 text-sm border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-300 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as UserRole)}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-300 dark:bg-gray-800 dark:text-gray-100"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <button
              onClick={handleInvite}
              disabled={!inviteEmail.trim()}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              Create
            </button>
            <button
              onClick={() => setInviting(false)}
              className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {created && (
          <div className="mb-4 p-4 border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/40 rounded-lg">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-green-800 dark:text-green-300">
                Invite created for {created.email} ({created.role}) — copy the link and send it to them.
              </p>
              <button
                onClick={() => setCreated(null)}
                className="text-green-400 dark:text-green-500 hover:text-green-600 dark:hover:text-green-300 text-xs mt-0.5"
              >
                Dismiss
              </button>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <code className="flex-1 text-xs bg-white dark:bg-gray-900 border border-green-200 dark:border-green-800 rounded px-3 py-2 font-mono overflow-hidden text-ellipsis whitespace-nowrap dark:text-gray-200">
                {inviteUrl(created.token)}
              </code>
              <button
                onClick={() => copyLink(created.token)}
                className="flex items-center gap-1 px-2 py-1.5 text-xs bg-green-700 text-white rounded hover:bg-green-800 transition-colors"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {pendingInvites.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 py-4">No pending invites.</p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {pendingInvites.map((invite) => (
              <div key={invite.id} className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{invite.email}</div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {invite.role} · invited by {invite.createdBy.name} · {new Date(invite.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={() => copyLink(invite.token)}
                  className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                  title="Copy invite link"
                >
                  <Copy size={14} />
                </button>
                <button
                  onClick={() => handleRevoke(invite.id)}
                  className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-500"
                  title="Revoke"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
