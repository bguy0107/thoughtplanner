'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, FileText, Table2, X } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

interface SearchResult {
  id: string
  title: string
  icon: string | null
  isDatabase: boolean
}

interface SearchModalProps {
  onClose: () => void
}

export function SearchModal({ onClose }: SearchModalProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) { setResults([]); return }

    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await api.search(query)
        setResults(data)
        setActiveIndex(0)
      } finally {
        setLoading(false)
      }
    }, 200)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  const navigate = useCallback((id: string) => {
    router.push(`/page/${id}`)
    onClose()
  }, [router, onClose])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && results[activeIndex]) navigate(results[activeIndex].id)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <Search size={18} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages…"
            className="flex-1 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none text-sm bg-transparent"
          />
          {loading && (
            <div className="w-4 h-4 border-2 border-gray-200 dark:border-gray-700 border-t-gray-500 dark:border-t-gray-400 rounded-full animate-spin flex-shrink-0" />
          )}
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
            <X size={16} />
          </button>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <ul className="py-1 max-h-80 overflow-y-auto">
            {results.map((r, i) => (
              <li key={r.id}>
                <button
                  onClick={() => navigate(r.id)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors',
                    i === activeIndex ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800',
                  )}
                >
                  <span className="flex-shrink-0 text-base leading-none">
                    {r.icon
                      ? r.icon
                      : r.isDatabase
                        ? <Table2 size={15} className="text-gray-400 dark:text-gray-500" />
                        : <FileText size={15} className="text-gray-400 dark:text-gray-500" />}
                  </span>
                  <span className="truncate text-gray-800 dark:text-gray-200">{r.title || 'Untitled'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {query.trim() && !loading && results.length === 0 && (
          <p className="px-4 py-6 text-sm text-center text-gray-400 dark:text-gray-500">No pages found</p>
        )}

        {!query && (
          <p className="px-4 py-4 text-xs text-center text-gray-400 dark:text-gray-500">Type to search your pages</p>
        )}
      </div>
    </div>
  )
}
