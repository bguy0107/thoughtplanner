import type { FastifyInstance, FastifyRequest } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { auth } from '../lib/auth.js'
import { requireWorkspaceMember } from '../lib/workspace.js'

async function getSession(req: FastifyRequest) {
  return auth.api.getSession({ headers: req.headers as unknown as Headers })
}

export async function searchRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { q?: string; workspaceId?: string } }>('/api/search', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const { workspaceId } = req.query
    if (!workspaceId) return reply.status(400).send({ error: 'workspaceId is required' })

    const access = await requireWorkspaceMember(session.user.id, workspaceId)
    if (!access.ok) return reply.status(access.status).send({ error: access.error })

    const q = (req.query.q ?? '').trim()
    if (q.length === 0) return []

    const results = await prisma.page.findMany({
      where: {
        workspaceId,
        isArchived: false,
        title: { contains: q, mode: 'insensitive' },
      },
      select: { id: true, title: true, icon: true, isDatabase: true },
      take: 20,
      orderBy: { updatedAt: 'desc' },
    })

    return results
  })
}
