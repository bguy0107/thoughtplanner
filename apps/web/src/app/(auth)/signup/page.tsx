'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { signUp } from '@/lib/auth-client'
import { api } from '@/lib/api'

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  )
}

function SignupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const inviteToken = searchParams.get('invite')

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [inviteRole, setInviteRole] = useState<string | null>(null)
  const [inviteChecked, setInviteChecked] = useState(false)

  useEffect(() => {
    if (!inviteToken) {
      setInviteChecked(true)
      return
    }
    api.invites
      .lookup(inviteToken)
      .then((invite) => {
        setEmail(invite.email)
        setInviteRole(invite.role)
      })
      .catch(() => setError('This invite link is invalid or has already been used.'))
      .finally(() => setInviteChecked(true))
  }, [inviteToken])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const result = await signUp.email({ name, email, password })
    if (result.error) {
      setLoading(false)
      setError(result.error.message ?? 'Could not create account')
      return
    }

    // The account is created with only the default role at this point — the
    // invite's role is granted here, now that we're authenticated as its
    // exact email and can present the token. See lib/auth.ts for why the
    // role isn't granted during account creation itself.
    if (inviteToken) {
      try {
        await api.invites.redeem(inviteToken)
      } catch {
        // Account still exists even if this fails (e.g. invite already used) —
        // let the user in rather than stranding them on the signup form.
      }
    }

    setLoading(false)
    router.push('/home')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f7f7f5] dark:bg-sidebar-dark-bg">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-8 w-full max-w-sm">
        <h1 className="text-2xl font-semibold mb-2 text-center text-gray-900 dark:text-gray-100">Create your account</h1>
        {inviteRole && (
          <p className="text-sm text-center text-gray-500 dark:text-gray-400 mb-6">
            You&apos;ve been invited to join as <span className="font-medium">{inviteRole}</span>.
          </p>
        )}
        {!inviteRole && <div className="mb-6" />}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={!!inviteRole}
              className="w-full border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>
          {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading || !inviteChecked}
            className="w-full bg-gray-900 text-white rounded-lg py-2 text-sm font-medium hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="text-sm text-center text-gray-500 dark:text-gray-400 mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-gray-900 dark:text-gray-100 font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
