'use client'

import { useSession } from '@/lib/auth-client'
import { useSidebarStore } from '@/store/sidebar'
import { useWorkspaceStore } from '@/store/workspace'
import { useRouter } from 'next/navigation'
import { FileText } from 'lucide-react'

export default function HomePage() {
  const { data: session } = useSession()
  const { addPage } = useSidebarStore()
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId)
  const router = useRouter()

  async function handleNewPage() {
    if (!currentWorkspaceId) return
    const page = await addPage(currentWorkspaceId)
    router.push(`/page/${page.id}`)
  }

  return (
    <div className="max-w-2xl mx-auto px-8 py-24 text-center">
      <h1 className="text-3xl font-semibold text-gray-800 dark:text-gray-100 mb-2">
        Good to see you, {session?.user.name?.split(' ')[0]}
      </h1>
      <p className="text-gray-500 dark:text-gray-400 mb-10">Start writing or open a page from the sidebar.</p>
      <button
        onClick={handleNewPage}
        className="inline-flex items-center gap-2 bg-gray-900 text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300 transition-colors"
      >
        <FileText size={16} />
        New page
      </button>
    </div>
  )
}
