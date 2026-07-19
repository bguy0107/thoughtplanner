import type { FastifyInstance, FastifyRequest } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { auth } from '../lib/auth.js'
import { wsJoin, wsLeave, wsBroadcast } from '../lib/wsHub.js'
import { requirePageAccess, getMembership, hasWorkspaceRole } from '../lib/workspace.js'

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
      const { workspaceId } = access

      wsJoin(pageId, socket)

      // Messages on a single socket are processed strictly in arrival order —
      // each handler is chained onto the previous one's promise so that a DB
      // write (and the broadcast that follows it) can never complete out of
      // order relative to an earlier message from the same client.
      let chain = Promise.resolve()

      socket.on('message', (raw: Buffer) => {
        chain = chain.then(async () => {
          try {
            const msg = JSON.parse(raw.toString())

            if (msg.type === 'page:content' && msg.pageId === pageId) {
              // Re-check the role on every write instead of once at connect
              // time, so a mid-session role downgrade (e.g. EDITOR -> VIEWER)
              // takes effect immediately rather than only on next reconnect.
              const membership = await getMembership(session.user.id, workspaceId)
              if (!membership || !hasWorkspaceRole(membership.role, 'EDITOR')) return

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
      })

      socket.on('close', () => wsLeave(pageId, socket))
    },
  )
}
