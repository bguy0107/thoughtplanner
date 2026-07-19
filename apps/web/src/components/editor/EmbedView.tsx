'use client'

import { useEffect, useRef, useState } from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { api } from '@/lib/api'

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`
}

export function EmbedView({ node, updateAttributes, selected, editor, extension, deleteNode }: NodeViewProps) {
  const { url, status, embedType, title, description, image, siteName, embedUrl, errorMessage, fileSize } = node.attrs
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const pageId = extension.options.pageId as string

  useEffect(() => {
    if (status === 'empty' && editor.isEditable) inputRef.current?.focus()
  }, [status, editor.isEditable])

  async function submit(value: string) {
    const trimmed = value.trim()
    if (!trimmed) return
    updateAttributes({ status: 'loading', url: trimmed })
    try {
      const meta = await api.embeds.resolve(pageId, trimmed)
      updateAttributes({ ...meta, status: 'ready', errorMessage: null })
    } catch (err) {
      updateAttributes({ status: 'error', errorMessage: err instanceof Error ? err.message : 'Failed to load preview' })
    }
  }

  if (status === 'empty' || status === 'error') {
    return (
      <NodeViewWrapper
        className={`my-1 rounded-md border p-3 ${selected ? 'ring-2 ring-blue-400' : 'border-gray-200 dark:border-gray-700'}`}
      >
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            submit(input)
          }}
        >
          <span className="text-lg">🔗</span>
          <input
            ref={inputRef}
            type="url"
            placeholder="Paste a link…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
            disabled={!editor.isEditable}
          />
          <button
            type="submit"
            className="rounded bg-blue-500 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
            disabled={!input.trim() || !editor.isEditable}
          >
            Embed
          </button>
          <button type="button" className="text-xs text-gray-400 hover:text-gray-600" onClick={() => deleteNode()}>
            Remove
          </button>
        </form>
        {status === 'error' && <p className="mt-1 text-xs text-red-500">{errorMessage ?? 'Could not load a preview for that link.'}</p>}
      </NodeViewWrapper>
    )
  }

  if (status === 'loading') {
    return (
      <NodeViewWrapper className="my-1 rounded-md border border-gray-200 p-3 text-sm text-gray-400 dark:border-gray-700">
        Loading preview…
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper
      className={`my-1 overflow-hidden rounded-md border ${selected ? 'ring-2 ring-blue-400' : 'border-gray-200 dark:border-gray-700'}`}
    >
      {embedType === 'pdf' && embedUrl ? (
        <div>
          {title && (
            <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-200">
              <span>📄</span>
              <span className="truncate">{title}</span>
            </div>
          )}
          <iframe src={embedUrl} className="h-[70vh] w-full" title={title ?? 'PDF'} />
        </div>
      ) : embedType === 'file' ? (
        <a
          href={url}
          download={title ?? undefined}
          className="flex items-center gap-3 p-3 no-underline hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          <span className="text-2xl">📎</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{title ?? url}</div>
            {typeof fileSize === 'number' && <div className="text-xs text-gray-400">{formatBytes(fileSize)}</div>}
          </div>
          <span className="flex-shrink-0 text-xs font-medium text-blue-500">Download</span>
        </a>
      ) : (
        <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-stretch no-underline">
          <div className="min-w-0 flex-1 p-3">
            <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{title ?? url}</div>
            {description && <div className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{description}</div>}
            <div className="mt-1 truncate text-xs text-gray-400">{siteName ?? hostnameOf(url)}</div>
          </div>
          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="w-32 flex-shrink-0 object-cover" />
          )}
        </a>
      )}
    </NodeViewWrapper>
  )
}
