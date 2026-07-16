'use client'

import { useRef, useState } from 'react'
import { X, Upload, CheckCircle2, AlertCircle } from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

interface ImportResult {
  pagesCreated: number
  databasesCreated: number
  errors: string[]
}

interface Props {
  onClose: () => void
  onImported: () => void
}

export function NotionImportModal({ onClose, onImported }: Props) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function upload(file: File) {
    if (!file.name.endsWith('.zip')) {
      setError('Please upload a .zip file exported from Notion.')
      return
    }

    setUploading(true)
    setError(null)
    setResult(null)

    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${API}/api/import/notion`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }))
        throw new Error(err.error ?? 'Upload failed')
      }
      const data = await res.json() as ImportResult
      setResult(data)
      onImported()
    } catch (e) {
      setError(String(e))
    } finally {
      setUploading(false)
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) upload(f)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) upload(f)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6 m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Import from Notion</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-500">
            <X size={16} />
          </button>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Export your Notion workspace as <strong>Markdown &amp; CSV</strong> (Settings → Export content),
          then upload the resulting .zip file here.
        </p>

        {/* Drop zone */}
        {!result && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              dragging ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30' : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            <input ref={fileRef} type="file" accept=".zip" className="hidden" onChange={handleFile} />
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-600 border-t-blue-600 rounded-full animate-spin" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Importing…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload size={24} className="text-gray-400 dark:text-gray-500" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Drop your Notion export .zip here</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">or click to browse</p>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 flex items-start gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-lg p-3">
            <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="mt-2 space-y-3">
            <div className="flex items-start gap-2 text-sm text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/40 rounded-lg p-4">
              <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Import complete</p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                  {result.pagesCreated} page{result.pagesCreated !== 1 ? 's' : ''} · {result.databasesCreated} database{result.databasesCreated !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded p-3 space-y-1">
                <p className="font-medium text-gray-700 dark:text-gray-300">{result.errors.length} item{result.errors.length !== 1 ? 's' : ''} skipped:</p>
                {result.errors.map((e, i) => <p key={i} className="truncate">{e}</p>)}
              </div>
            )}
            <button
              onClick={onClose}
              className="w-full py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300 transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
