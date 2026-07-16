import { randomUUID } from 'crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { auth } from '../lib/auth.js'
import { wsBroadcast } from '../lib/wsHub.js'

async function getSession(req: FastifyRequest) {
  return auth.api.getSession({ headers: req.headers as unknown as Headers })
}

const CreatePageSchema = z.object({
  parentPageId: z.string().optional(),
  title: z.string().default('Untitled'),
  icon: z.string().optional(),
  position: z.number().optional(),
  isDatabase: z.boolean().default(false),
})

const UpdatePageSchema = z.object({
  title: z.string().optional(),
  icon: z.string().nullable().optional(),
  coverImage: z.string().nullable().optional(),
  content: z.unknown().optional(),
  isArchived: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  position: z.number().optional(),
  parentPageId: z.string().nullable().optional(),
})

export async function pageRoutes(app: FastifyInstance) {
  // GET /api/pages — flat list of all non-archived pages for sidebar
  app.get('/api/pages', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const pages = await prisma.page.findMany({
      where: { isArchived: false },
      select: {
        id: true,
        parentPageId: true,
        title: true,
        icon: true,
        isDatabase: true,
        position: true,
        updatedAt: true,
      },
      orderBy: { position: 'asc' },
    })

    return pages
  })

  // GET /api/pages/:id — full page with content
  app.get<{ Params: { id: string } }>('/api/pages/:id', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const page = await prisma.page.findUnique({
      where: { id: req.params.id },
      include: { files: true },
    })

    if (!page) return reply.status(404).send({ error: 'Not found' })
    return page
  })

  // POST /api/pages — create a new page
  app.post('/api/pages', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const body = CreatePageSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    // Place new page at end of its siblings
    const siblings = await prisma.page.findMany({
      where: { parentPageId: body.data.parentPageId ?? null, isArchived: false },
      select: { position: true },
      orderBy: { position: 'desc' },
      take: 1,
    })
    const position = body.data.position ?? (siblings[0] ? siblings[0].position + 1 : 0)

    const page = await prisma.page.create({
      data: {
        ...body.data,
        position,
        createdById: session.user.id,
        updatedById: session.user.id,
      },
    })

    if (page.isDatabase) {
      await prisma.databaseSchema.create({
        data: {
          pageId: page.id,
          columns: [{ id: randomUUID(), name: 'Name', type: 'text' }],
        },
      })
    }

    return reply.status(201).send(page)
  })

  // PATCH /api/pages/:id — update page (content, title, etc.)
  app.patch<{ Params: { id: string } }>('/api/pages/:id', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const body = UpdatePageSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const page = await prisma.page.update({
      where: { id: req.params.id },
      data: {
        ...body.data,
        updatedById: session.user.id,
      },
    })

    if (body.data.title !== undefined || body.data.icon !== undefined) {
      wsBroadcast(req.params.id, {
        type: 'page:meta',
        pageId: req.params.id,
        title: page.title,
        icon: page.icon,
      })
    }

    return page
  })

  // DELETE /api/pages/:id — archive (soft delete)
  app.delete<{ Params: { id: string } }>('/api/pages/:id', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    await prisma.page.update({
      where: { id: req.params.id },
      data: { isArchived: true, updatedById: session.user.id },
    })

    return reply.status(204).send()
  })
}
