import { randomUUID } from 'crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { auth } from '../lib/auth.js'
import { wsBroadcast } from '../lib/wsHub.js'
import { requirePageAccess, requireWorkspaceMember } from '../lib/workspace.js'

async function getSession(req: FastifyRequest) {
  return auth.api.getSession({ headers: req.headers as unknown as Headers })
}

const CreatePageSchema = z.object({
  workspaceId: z.string(),
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
  // GET /api/pages?workspaceId= — flat list of non-archived pages for the sidebar.
  // Omitting workspaceId falls back to every page across the caller's workspaces.
  app.get<{ Querystring: { workspaceId?: string } }>('/api/pages', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const { workspaceId } = req.query

    let where: { isArchived: boolean; workspaceId: string | { in: string[] } }
    if (workspaceId) {
      const access = await requireWorkspaceMember(session.user.id, workspaceId)
      if (!access.ok) return reply.status(access.status).send({ error: access.error })
      where = { isArchived: false, workspaceId }
    } else {
      const memberships = await prisma.workspaceMember.findMany({
        where: { userId: session.user.id },
        select: { workspaceId: true },
      })
      where = { isArchived: false, workspaceId: { in: memberships.map((m) => m.workspaceId) } }
    }

    const pages = await prisma.page.findMany({
      where,
      select: {
        id: true,
        workspaceId: true,
        parentPageId: true,
        title: true,
        icon: true,
        isDatabase: true,
        position: true,
        updatedAt: true,
      },
      orderBy: { position: 'asc' },
      take: 2000,
    })

    return pages
  })

  // GET /api/pages/:id — full page with content
  app.get<{ Params: { id: string } }>('/api/pages/:id', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const access = await requirePageAccess(session.user.id, req.params.id)
    if (!access.ok) return reply.status(access.status).send({ error: access.error })

    const page = await prisma.page.findUnique({
      where: { id: req.params.id },
      include: { files: true, updatedBy: { select: { id: true, name: true } } },
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

    const access = await requireWorkspaceMember(session.user.id, body.data.workspaceId, 'EDITOR')
    if (!access.ok) return reply.status(access.status).send({ error: access.error })

    if (body.data.parentPageId) {
      const parent = await prisma.page.findUnique({
        where: { id: body.data.parentPageId },
        select: { workspaceId: true },
      })
      if (!parent) return reply.status(404).send({ error: 'Parent page not found' })
      if (parent.workspaceId !== body.data.workspaceId) {
        return reply.status(400).send({ error: 'Parent page belongs to a different workspace' })
      }
    }

    // Place new page at end of its siblings
    const siblings = await prisma.page.findMany({
      where: {
        workspaceId: body.data.workspaceId,
        parentPageId: body.data.parentPageId ?? null,
        isArchived: false,
      },
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

    const access = await requirePageAccess(session.user.id, req.params.id, 'EDITOR')
    if (!access.ok) return reply.status(access.status).send({ error: access.error })

    const body = UpdatePageSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    if (body.data.parentPageId) {
      if (body.data.parentPageId === req.params.id) {
        return reply.status(400).send({ error: 'A page cannot be its own parent' })
      }

      const parent = await prisma.page.findUnique({
        where: { id: body.data.parentPageId },
        select: { workspaceId: true },
      })
      if (!parent) return reply.status(404).send({ error: 'Parent page not found' })
      if (parent.workspaceId !== access.workspaceId) {
        return reply.status(400).send({ error: 'Cannot move a page to a different workspace' })
      }

      // Reject moving a page under one of its own descendants — that would
      // create a cycle in the parent chain, sending the recursive-CTE archive
      // query below (and any tree renderer walking parentPageId) into an
      // infinite loop.
      const cycle = await prisma.$queryRaw<Array<{ id: string }>>`
        WITH RECURSIVE ancestors AS (
          SELECT id, "parentPageId" FROM "Page" WHERE id = ${body.data.parentPageId}
          UNION ALL
          SELECT p.id, p."parentPageId" FROM "Page" p INNER JOIN ancestors a ON p.id = a."parentPageId"
        )
        SELECT id FROM ancestors WHERE id = ${req.params.id} LIMIT 1
      `
      if (cycle.length > 0) {
        return reply.status(400).send({ error: 'Cannot move a page under one of its own descendants' })
      }
    }

    const { content, ...rest } = body.data

    const page = await prisma.page.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        ...(content !== undefined
          ? { content: (content === null ? Prisma.JsonNull : content) as Prisma.InputJsonValue }
          : {}),
        updatedById: session.user.id,
      },
      include: { updatedBy: { select: { id: true, name: true } } },
    })
    const updatedAt = page.updatedAt.toISOString()
    const updatedBy = { id: page.updatedBy.id, name: page.updatedBy.name }

    if (body.data.title !== undefined || body.data.icon !== undefined) {
      wsBroadcast(req.params.id, {
        type: 'page:meta',
        pageId: req.params.id,
        title: page.title,
        icon: page.icon,
        updatedAt,
        updatedBy,
      })
    }

    // The editor normally sends content over the WS route (see routes/ws.ts),
    // which broadcasts to other viewers. This REST path is the fallback used
    // when that socket is down — it must also broadcast, or a save made while
    // disconnected silently overwrites the page with no one else notified.
    if (content !== undefined) {
      wsBroadcast(req.params.id, { type: 'page:content', pageId: req.params.id, content: page.content, updatedAt, updatedBy })
    }

    return page
  })

  // DELETE /api/pages/:id — archive (soft delete), cascading to all descendant pages
  app.delete<{ Params: { id: string } }>('/api/pages/:id', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const access = await requirePageAccess(session.user.id, req.params.id, 'EDITOR')
    if (!access.ok) return reply.status(access.status).send({ error: access.error })

    await prisma.$executeRaw`
      WITH RECURSIVE descendants AS (
        SELECT id FROM "Page" WHERE id = ${req.params.id}
        UNION ALL
        SELECT p.id FROM "Page" p INNER JOIN descendants d ON p."parentPageId" = d.id
      )
      UPDATE "Page"
      SET "isArchived" = true, "updatedById" = ${session.user.id}, "updatedAt" = now()
      WHERE id IN (SELECT id FROM descendants)
    `

    return reply.status(204).send()
  })
}
