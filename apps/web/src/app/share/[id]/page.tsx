'use client'

import { use, useEffect, useState } from 'react'
import { Globe } from 'lucide-react'
import { api, type Page } from '@/lib/api'
import { Editor } from '@/components/editor/Editor'

type PublicPage = Pick<Page, 'id' | 'title' | 'icon' | 'coverImage' | 'content' | 'isPublic' | 'isDatabase'>

export default function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [page, setPage] = useState<PublicPage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.pages.getPublic(id)
      .then(setPage)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#191919]">
        <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-600 border-t-gray-600 dark:border-t-gray-300 rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !page) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-white dark:bg-[#191919] text-center px-4">
        <p className="text-gray-500 dark:text-gray-400 text-lg">{error ?? 'Page not found'}</p>
        <a href="/" className="text-sm text-blue-500 dark:text-blue-400 hover:underline">Go home</a>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#191919]">
      {/* Cover */}
      {page.coverImage && (
        <div className="w-full h-48 md:h-64 overflow-hidden bg-gray-100 dark:bg-gray-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={page.coverImage} alt="Cover" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 md:px-8 py-10 md:py-16">
        {/* Icon */}
        {page.icon && <div className="text-5xl mb-4 leading-none">{page.icon}</div>}

        {/* Title */}
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-6">{page.title || 'Untitled'}</h1>

        {/* Content */}
        <Editor
          key={page.id}
          pageId={page.id}
          initialContent={page.content}
          onChange={() => {}}
          readOnly
        />

        {/* Footer badge */}
        <div className="mt-16 pt-6 border-t border-gray-100 dark:border-gray-800 flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
          <Globe size={12} />
          <span>Shared with Thoughtplanner</span>
        </div>
      </div>
    </div>
  )
}
