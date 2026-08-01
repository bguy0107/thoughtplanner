'use client'

import { use, useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Globe, Lock, Link2, ImagePlus, X, Download, Upload } from 'lucide-react'
import { api, type Page } from '@/lib/api'
import { useSidebarStore } from '@/store/sidebar'
import { Editor, type EditorHandle } from '@/components/editor/Editor'
import { DatabaseView } from '@/components/database/DatabaseView'
import { IconPicker } from '@/components/IconPicker'
import { LastEditedLabel } from '@/components/LastEditedLabel'

export default function PageView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [page, setPage] = useState<Page | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const markdownImportRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<EditorHandle>(null)
  const { updatePage } = useSidebarStore()

  useEffect(() => {
    setLoading(true)
    setLoadError(null)
    api.pages.get(id)
      .then((p) => setPage(p))
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Failed to load page'))
      .finally(() => setLoading(false))
  }, [id])

  // PATCH responses always carry the fresh updatedAt/updatedBy — merge them in
  // so the "last edited" label reflects the save without a separate refetch.
  // Takes the id the request was made *for* and no-ops if the user has since
  // navigated to a different page — otherwise a slow response for page A
  // (e.g. the debounced editor save firing after the user already clicked
  // away) lands on whatever page is current and stamps A's metadata onto it.
  const applyMeta = useCallback((forId: string, updated: Pick<Page, 'updatedAt' | 'updatedBy'>) => {
    setPage((p) => p && p.id === forId ? { ...p, updatedAt: updated.updatedAt, updatedBy: updated.updatedBy } : p)
  }, [])

  const handleTitleChange = useCallback(
    async (title: string) => {
      if (!page) return
      setPage((p) => p ? { ...p, title } : p)
      updatePage(id, { title })
      applyMeta(id, await api.pages.update(id, { title }))
    },
    [id, page, updatePage, applyMeta],
  )

  const handleContentChange = useCallback(
    async (content: unknown) => {
      if (!page) return
      applyMeta(id, await api.pages.update(id, { content }))
    },
    [id, page, applyMeta],
  )

  const handleIconChange = useCallback(
    async (icon: string | null) => {
      setPage((p) => p ? { ...p, icon } : p)
      updatePage(id, { icon })
      applyMeta(id, await api.pages.update(id, { icon }))
    },
    [id, updatePage, applyMeta],
  )

  const handleCoverUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      e.target.value = ''
      const uploaded = await api.files.upload(id, file)
      setPage((p) => p ? { ...p, coverImage: uploaded.url } : p)
      applyMeta(id, await api.pages.update(id, { coverImage: uploaded.url }))
    },
    [id, applyMeta],
  )

  const handleRemoveCover = useCallback(async () => {
    setPage((p) => p ? { ...p, coverImage: null } : p)
    applyMeta(id, await api.pages.update(id, { coverImage: null }))
  }, [id, applyMeta])

  const handleRemoteMeta = useCallback(
    (meta: { title?: string; icon?: string | null; updatedAt?: string; updatedBy?: { id: string; name: string } }) => {
      setPage((p) => (p ? {
        ...p,
        ...(meta.title !== undefined ? { title: meta.title } : {}),
        ...(meta.icon !== undefined ? { icon: meta.icon } : {}),
        ...(meta.updatedAt !== undefined ? { updatedAt: meta.updatedAt } : {}),
        ...(meta.updatedBy !== undefined ? { updatedBy: meta.updatedBy } : {}),
      } : p))
      updatePage(id, meta)
    },
    [id, updatePage],
  )

  const handleTogglePublic = useCallback(async () => {
    if (!page) return
    const isPublic = !page.isPublic
    setPage((p) => p ? { ...p, isPublic } : p)
    applyMeta(id, await api.pages.update(id, { isPublic }))
  }, [id, page, applyMeta])

  const handleCopyShareLink = useCallback(() => {
    const url = `${window.location.origin}/share/${id}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [id])

  const handleExportMarkdown = useCallback(() => {
    if (!editorRef.current || !page) return
    const md = editorRef.current.getMarkdown()
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${page.title || 'Untitled'}.md`
    a.click()
    URL.revokeObjectURL(url)
  }, [page])

  const handleImportMarkdown = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file || !editorRef.current) return
      e.target.value = ''
      const text = await file.text()
      editorRef.current.importMarkdown(text)
    },
    [],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-600 border-t-gray-600 dark:border-t-gray-300 rounded-full animate-spin" />
      </div>
    )
  }

  if (loadError) {
    return <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500">{loadError}</div>
  }

  if (!page) {
    return <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500">Page not found</div>
  }

  if (page.isDatabase) {
    return <DatabaseView page={page} onTitleChange={handleTitleChange} />
  }

  return (
    <div className="min-h-full">
      {/* Cover image */}
      {page.coverImage ? (
        <div className="relative w-full h-48 md:h-64 group overflow-hidden bg-gray-100 dark:bg-gray-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={page.coverImage} alt="Cover" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
          <div className="absolute bottom-2 right-3 hidden group-hover:flex gap-2">
            <button
              onClick={() => coverInputRef.current?.click()}
              className="flex items-center gap-1 text-xs bg-white/90 dark:bg-gray-900/90 hover:bg-white dark:hover:bg-gray-900 text-gray-700 dark:text-gray-200 px-2 py-1 rounded shadow transition-colors"
            >
              <ImagePlus size={12} /> Change cover
            </button>
            <button
              onClick={handleRemoveCover}
              className="flex items-center gap-1 text-xs bg-white/90 dark:bg-gray-900/90 hover:bg-white dark:hover:bg-gray-900 text-gray-700 dark:text-gray-200 px-2 py-1 rounded shadow transition-colors"
            >
              <X size={12} /> Remove
            </button>
          </div>
        </div>
      ) : null}

      <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
      <input ref={markdownImportRef} type="file" accept=".md,text/markdown" className="hidden" onChange={handleImportMarkdown} />

      {/* Page content */}
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-10 md:py-16">
        {/* Icon */}
        <div className="mb-3">
          <IconPicker value={page.icon} onChange={handleIconChange} />
        </div>

        {/* Hover-reveal toolbar */}
        <div className="flex items-center gap-3 mb-2 group/toolbar">
          <div className="opacity-0 group-hover/toolbar:opacity-100 flex items-center gap-2 transition-opacity">
            {!page.coverImage && (
              <button
                onClick={() => coverInputRef.current?.click()}
                className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <ImagePlus size={13} /> Add cover
              </button>
            )}
            <button
              onClick={handleTogglePublic}
              className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              {page.isPublic ? <><Globe size={13} /> Public</> : <><Lock size={13} /> Private</>}
            </button>
            {page.isPublic && (
              <button
                onClick={handleCopyShareLink}
                className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <Link2 size={13} /> {copied ? 'Copied!' : 'Copy link'}
              </button>
            )}
            <button
              onClick={handleExportMarkdown}
              className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <Download size={13} /> Export .md
            </button>
            <button
              onClick={() => markdownImportRef.current?.click()}
              className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <Upload size={13} /> Import .md
            </button>
          </div>
        </div>

        {/* Title */}
        <div className="flex items-end gap-3 mb-6">
          <input
            key={`title-${page.id}`}
            defaultValue={page.title}
            placeholder="Untitled"
            onBlur={(e) => handleTitleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                ;(e.target as HTMLInputElement).blur()
              }
            }}
            className="flex-1 min-w-0 text-4xl font-bold text-gray-900 dark:text-gray-100 outline-none placeholder-gray-300 dark:placeholder-gray-600 bg-transparent"
          />
          <LastEditedLabel updatedAt={page.updatedAt} updatedBy={page.updatedBy} />
        </div>

        <Editor
          ref={editorRef}
          key={`editor-${page.id}`}
          pageId={page.id}
          workspaceId={page.workspaceId}
          initialContent={page.content}
          onChange={handleContentChange}
          onNavigate={router.push}
          onRemoteMeta={handleRemoteMeta}
        />
      </div>
    </div>
  )
}
