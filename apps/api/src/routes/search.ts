import type { FastifyInstance, FastifyRequest } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { auth } from '../lib/auth.js'

async function getSession(req: FastifyRequest) {
  return auth.api.getSession({ headers: req.headers as unknown as Headers })
}

export async function searchRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { q?: string } }>('/api/search', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const q = ((req.query as { q?: string }).q ?? '').trim()
    if (q.length === 0) return []

    const results = await prisma.page.findMany({
      where: {
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
