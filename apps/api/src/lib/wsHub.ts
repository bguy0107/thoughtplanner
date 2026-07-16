interface Socket {
  send(data: string): void
  readyState: number
}

export type WSMessage =
  | { type: 'page:content'; pageId: string; content: unknown }
  | { type: 'page:meta'; pageId: string; title?: string; icon?: string | null }

const rooms = new Map<string, Set<Socket>>()

export function wsJoin(pageId: string, socket: Socket) {
  if (!rooms.has(pageId)) rooms.set(pageId, new Set())
  rooms.get(pageId)!.add(socket)
}

export function wsLeave(pageId: string, socket: Socket) {
  rooms.get(pageId)?.delete(socket)
  if (rooms.get(pageId)?.size === 0) rooms.delete(pageId)
}

export function wsBroadcast(pageId: string, msg: WSMessage, exclude?: Socket) {
  const room = rooms.get(pageId)
  if (!room) return
  const payload = JSON.stringify(msg)
  for (const client of room) {
    if (client !== exclude && client.readyState === 1) {
      client.send(payload)
    }
  }
}
