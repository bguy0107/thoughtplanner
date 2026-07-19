'use client'

import { useState } from 'react'
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react'

export function CodeBlockView({ node }: NodeViewProps) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(node.textContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard API can be unavailable (insecure context, denied permission) — nothing to fall back to
    }
  }

  return (
    <NodeViewWrapper className="group relative">
      <button
        type="button"
        contentEditable={false}
        onClick={copy}
        className="absolute right-2 top-2 z-10 rounded border border-gray-600 bg-gray-800/90 px-2 py-1 text-xs text-gray-200 opacity-0 transition-opacity hover:bg-gray-700 group-hover:opacity-100"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre>
        <NodeViewContent as="code" className={node.attrs.language ? `language-${node.attrs.language}` : undefined} />
      </pre>
    </NodeViewWrapper>
  )
}
