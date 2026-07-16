'use client'

import { useEffect, useRef, useCallback } from 'react'
import type { Editor } from '@tiptap/react'

const WS_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/^http/, 'ws')

export function usePageSync(pageId: string, editor: Editor | null) {
  const wsRef = useRef<WebSocket | null>(null)
  const suppressRef = useRef(false)

  useEffect(() => {
    const ws = new WebSocket(`${WS_BASE}/api/ws?pageId=${pageId}`)
    wsRef.current = ws

    ws.onmessage = (event) => {
      if (!editor) return
      try {
        const msg = JSON.parse(event.data as string)
        if (msg.type === 'page:content' && msg.pageId === pageId) {
          suppressRef.current = true
          editor.commands.setContent(msg.content as object, false)
          suppressRef.current = false
        }
      } catch {
        // ignore
      }
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [pageId, editor])

  const sendContent = useCallback(
    (content: unknown) => {
      if (suppressRef.current) return
      const ws = wsRef.current
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'page:content', pageId, content }))
      }
    },
    [pageId],
  )

  return { sendContent, suppressRef }
}
