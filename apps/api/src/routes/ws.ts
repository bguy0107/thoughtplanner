import type { FastifyInstance, FastifyRequest } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { auth } from '../lib/auth.js'
import { wsJoin, wsLeave, wsBroadcast } from '../lib/wsHub.js'
import { requirePageAccess, hasWorkspaceRole } from '../lib/workspace.js'

async function getSession(req: FastifyRequest) {
  return auth.api.getSession({ headers: req.headers as unknown as Headers })
}

export async function wsRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { pageId?: string } }>(
    '/api/ws',
    { websocket: true },
    async (socket, req) => {
      const session = await getSession(req)
      if (!session) {
        socket.close(1008, 'Unauthorized')
        return
      }

      const pageId = (req.query as { pageId?: string }).pageId
      if (!pageId) {
        socket.close(1008, 'Missing pageId')
        return
      }

      const access = await requirePageAccess(session.user.id, pageId)
      if (!access.ok) {
        socket.close(1008, 'Forbidden')
        return
      }
      const canEdit = hasWorkspaceRole(access.membership.role, 'EDITOR')

      wsJoin(pageId, socket)

      socket.on('message', async (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString())

          if (msg.type === 'page:content' && msg.pageId === pageId && canEdit) {
            await prisma.page.update({
              where: { id: pageId },
              data: { content: msg.content, updatedById: session.user.id },
            })
            wsBroadcast(pageId, { type: 'page:content', pageId, content: msg.content }, socket)
          }
        } catch {
          // ignore malformed messages
        }
      })

      socket.on('close', () => wsLeave(pageId, socket))
    },
  )
}
