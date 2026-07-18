'use client'

import { useEffect, useState } from 'react'
import { Copy, Trash2, Plus, Check, Eye, EyeOff } from 'lucide-react'
import { api, type ApiKey, type ApiKeyCreated } from '@/lib/api'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useSession } from '@/lib/auth-client'
import { UsersPanel } from '@/components/settings/UsersPanel'
import { PagesPanel } from '@/components/settings/PagesPanel'
import { DatabasesPanel } from '@/components/settings/DatabasesPanel'

type Tab = 'general' | 'users' | 'pages' | 'databases'

export default function SettingsPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user.role === 'ADMIN'
  const [tab, setTab] = useState<Tab>('general')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'general', label: 'General' },
    ...(isAdmin
      ? ([
          { id: 'users', label: 'Users' },
          { id: 'pages', label: 'Pages' },
          { id: 'databases', label: 'Databases' },
        ] as const)
      : []),
  ]

  return (
    <div className="max-w-2xl mx-auto px-8 py-12">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Settings</h1>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800 mb-8">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' && <GeneralSettings />}
      {tab === 'users' && isAdmin && <UsersPanel />}
      {tab === 'pages' && isAdmin && <PagesPanel />}
      {tab === 'databases' && isAdmin && <DatabasesPanel />}
    </div>
  )
}

function GeneralSettings() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [created, setCreated] = useState<ApiKeyCreated | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

  useEffect(() => {
    api.apiKeys.list().then((k) => {
      setKeys(k)
      setLoading(false)
    })
  }, [])

  async function handleCreate() {
    if (!newName.trim()) return
    const result = await api.apiKeys.create(newName.trim())
    setCreated(result)
    setKeys((k) => [result, ...k])
    setNewName('')
    setCreating(false)
    setShowKey(false)
    setCopied(false)
  }

  async function handleDelete(id: string) {
    await api.apiKeys.delete(id)
    setKeys((k) => k.filter((key) => key.id !== id))
    if (created?.id === id) setCreated(null)
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      {/* Appearance section */}
      <section className="mb-10">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Appearance</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Choose how Thoughtplanner looks on this device.
            </p>
          </div>
          <ThemeToggle />
        </div>
      </section>

      {/* API Keys section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">API Keys</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Use an API key to read your data programmatically via the REST API.
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-900 text-white rounded hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300 transition-colors"
          >
            <Plus size={14} /> New key
          </button>
        </div>

        {/* REST API reference */}
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-6 text-xs font-mono text-gray-600 dark:text-gray-300 space-y-1">
          <div className="text-gray-400 dark:text-gray-500 text-xs font-sans mb-2">Available endpoints</div>
          <div>GET {apiBase}/api/v1/pages</div>
          <div>GET {apiBase}/api/v1/pages/:id</div>
          <div>GET {apiBase}/api/v1/pages/:id/markdown</div>
          <div>GET {apiBase}/api/v1/databases/:id</div>
          <div className="mt-2 text-gray-400 dark:text-gray-500 font-sans">Pass <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">X-API-Key: &lt;your-key&gt;</code> header</div>
        </div>

        {/* Create form */}
        {creating && (
          <div className="flex gap-2 mb-4">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') { setCreating(false); setNewName('') }
              }}
              placeholder="Key name (e.g. My Script)"
              className="flex-1 text-sm border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-300 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              Create
            </button>
            <button
              onClick={() => { setCreating(false); setNewName('') }}
              className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Newly created key display */}
        {created && (
          <div className="mb-4 p-4 border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/40 rounded-lg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-green-800 dark:text-green-300 mb-1">Key created — copy it now</p>
                <p className="text-xs text-green-600 dark:text-green-400">This is the only time it will be shown.</p>
              </div>
              <button
                onClick={() => setCreated(null)}
                className="text-green-400 dark:text-green-500 hover:text-green-600 dark:hover:text-green-300 text-xs mt-0.5"
              >
                Dismiss
              </button>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <code className="flex-1 text-xs bg-white dark:bg-gray-900 border border-green-200 dark:border-green-800 rounded px-3 py-2 font-mono overflow-hidden text-ellipsis whitespace-nowrap dark:text-gray-200">
                {showKey ? created.key : `${created.prefix}${'•'.repeat(30)}`}
              </code>
              <button
                onClick={() => setShowKey((s) => !s)}
                className="p-1.5 text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300"
                title={showKey ? 'Hide' : 'Show'}
              >
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
              <button
                onClick={() => copyKey(created.key)}
                className="flex items-center gap-1 px-2 py-1.5 text-xs bg-green-700 text-white rounded hover:bg-green-800 transition-colors"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {/* Key list */}
        {loading ? (
          <div className="py-8 flex justify-center">
            <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-gray-600 dark:border-t-gray-300 rounded-full animate-spin" />
          </div>
        ) : keys.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 py-4">No API keys yet.</p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {keys.map((key) => (
              <div key={key.id} className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{key.name}</div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    <code className="font-mono">{key.prefix}{'•'.repeat(10)}</code>
                    {' · '}Created {new Date(key.createdAt).toLocaleDateString()}
                    {key.lastUsed ? ` · Last used ${new Date(key.lastUsed).toLocaleDateString()}` : ' · Never used'}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(key.id)}
                  className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-500 transition-colors"
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
