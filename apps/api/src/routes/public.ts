import type { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'

export async function publicRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/api/public/:id', async (req, reply) => {
    const page = await prisma.page.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        title: true,
        icon: true,
        coverImage: true,
        content: true,
        isPublic: true,
        isArchived: true,
        isDatabase: true,
      },
    })

    if (!page || page.isArchived) return reply.status(404).send({ error: 'Not found' })
    if (!page.isPublic) return reply.status(403).send({ error: 'This page is private' })

    return page
  })
}
