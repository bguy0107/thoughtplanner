'use client'

import { useEffect, useRef, useCallback } from 'react'
import type { Editor } from '@tiptap/react'
import { api } from '@/lib/api'

const WS_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/^http/, 'ws')
const MAX_RECONNECT_DELAY_MS = 15000

export type PageMeta = {
  title?: string
  icon?: string | null
  updatedAt?: string
  updatedBy?: { id: string; name: string }
}

export function usePageSync(
  pageId: string,
  editor: Editor | null,
  onMeta?: (meta: PageMeta) => void,
  // Lets the caller report "the user has typed something we haven't sent yet"
  // so a reconnect doesn't clobber in-flight local edits with server state.
  hasPendingChanges?: () => boolean,
) {
  const wsRef = useRef<WebSocket | null>(null)
  const suppressRef = useRef(false)
  const onMetaRef = useRef(onMeta)
  onMetaRef.current = onMeta
  const hasPendingRef = useRef(hasPendingChanges)
  hasPendingRef.current = hasPendingChanges
  const editorRef = useRef(editor)
  editorRef.current = editor

  useEffect(() => {
    let unmounted = false
    let reconnectAttempt = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    function connect() {
      const ws = new WebSocket(`${WS_BASE}/api/ws?pageId=${pageId}`)
      wsRef.current = ws

      ws.onopen = () => {
        const wasReconnect = reconnectAttempt > 0
        reconnectAttempt = 0
        // We may have missed other clients' edits while disconnected. Pull the
        // latest server content — but only if the user has no unsent local
        // edits, so we never overwrite someone's in-progress typing.
        if (wasReconnect && !hasPendingRef.current?.()) {
          api.pages.get(pageId).then((page) => {
            if (unmounted || hasPendingRef.current?.() || !editorRef.current) return
            suppressRef.current = true
            editorRef.current.commands.setContent(page.content as object, false)
            suppressRef.current = false
          }).catch(() => {
            // best-effort; the next successful save/broadcast will reconcile
          })
        }
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string)
          if (msg.type === 'page:content' && msg.pageId === pageId) {
            if (!editorRef.current) return
            // Same guard as the reconnect path above: if this client has its
            // own unsent edit sitting in the debounce window, a remote save
            // landing right now must not stomp it. It'll be reconciled once
            // this client's own save goes out.
            if (hasPendingRef.current?.()) return
            suppressRef.current = true
            editorRef.current.commands.setContent(msg.content as object, false)
            suppressRef.current = false
            onMetaRef.current?.({ updatedAt: msg.updatedAt, updatedBy: msg.updatedBy })
          } else if (msg.type === 'page:meta' && msg.pageId === pageId) {
            onMetaRef.current?.({ title: msg.title, icon: msg.icon, updatedAt: msg.updatedAt, updatedBy: msg.updatedBy })
          } else if (msg.type === 'page:saved' && msg.pageId === pageId) {
            onMetaRef.current?.({ updatedAt: msg.updatedAt, updatedBy: msg.updatedBy })
          }
        } catch {
          // ignore
        }
      }

      ws.onclose = (event) => {
        wsRef.current = null
        // 1008 means the server rejected auth/permission/params — retrying
        // won't help, so don't loop on it.
        if (unmounted || event.code === 1008) return
        const delay = Math.min(1000 * 2 ** reconnectAttempt, MAX_RECONNECT_DELAY_MS)
        reconnectAttempt += 1
        reconnectTimer = setTimeout(connect, delay)
      }
    }

    connect()

    return () => {
      unmounted = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [pageId])

  const sendContent = useCallback(
    (content: unknown): boolean => {
      if (suppressRef.current) return false
      const ws = wsRef.current
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'page:content', pageId, content }))
        return true
      }
      return false
    },
    [pageId],
  )

  return { sendContent, suppressRef }
}
