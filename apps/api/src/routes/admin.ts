import type { FastifyInstance, FastifyRequest } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { auth } from '../lib/auth.js'
import { isAdmin } from '../lib/permissions.js'

async function getSession(req: FastifyRequest) {
  return auth.api.getSession({ headers: req.headers as unknown as Headers })
}

export async function adminRoutes(app: FastifyInstance) {
  // GET /api/admin/pages — every page (including archived), for workspace oversight
  app.get('/api/admin/pages', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })
    if (!isAdmin(session.user)) return reply.status(403).send({ error: 'Admins only' })

    const pages = await prisma.page.findMany({
      select: {
        id: true,
        parentPageId: true,
        title: true,
        icon: true,
        isDatabase: true,
        isArchived: true,
        isPublic: true,
        updatedAt: true,
        createdBy: { select: { id: true, name: true } },
        updatedBy: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    })

    return pages
  })

  // POST /api/admin/pages/:id/restore — recursively unarchive a page + descendants
  app.post<{ Params: { id: string } }>('/api/admin/pages/:id/restore', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })
    if (!isAdmin(session.user)) return reply.status(403).send({ error: 'Admins only' })

    const page = await prisma.page.findUnique({ where: { id: req.params.id } })
    if (!page) return reply.status(404).send({ error: 'Not found' })

    await prisma.$executeRaw`
      WITH RECURSIVE descendants AS (
        SELECT id FROM "Page" WHERE id = ${req.params.id}
        UNION ALL
        SELECT p.id FROM "Page" p INNER JOIN descendants d ON p."parentPageId" = d.id
      )
      UPDATE "Page"
      SET "isArchived" = false, "updatedById" = ${session.user.id}, "updatedAt" = now()
      WHERE id IN (SELECT id FROM descendants)
    `

    return reply.status(204).send()
  })

  // DELETE /api/admin/pages/:id/purge — permanently delete an archived page + descendants
  app.delete<{ Params: { id: string } }>('/api/admin/pages/:id/purge', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })
    if (!isAdmin(session.user)) return reply.status(403).send({ error: 'Admins only' })

    const page = await prisma.page.findUnique({ where: { id: req.params.id } })
    if (!page) return reply.status(404).send({ error: 'Not found' })
    if (!page.isArchived) return reply.status(400).send({ error: 'Archive the page before purging it' })

    // Children first (FK from Page.parentPageId has no cascade), deepest last-in-first-out
    // via repeated deletion of current leaves until nothing is left in the subtree.
    await prisma.$executeRaw`
      WITH RECURSIVE descendants AS (
        SELECT id FROM "Page" WHERE id = ${req.params.id}
        UNION ALL
        SELECT p.id FROM "Page" p INNER JOIN descendants d ON p."parentPageId" = d.id
      )
      DELETE FROM "Page" WHERE id IN (SELECT id FROM descendants)
    `

    return reply.status(204).send()
  })

  // GET /api/admin/databases — every Notion-style database page, with size stats
  app.get('/api/admin/databases', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })
    if (!isAdmin(session.user)) return reply.status(403).send({ error: 'Admins only' })

    const pages = await prisma.page.findMany({
      where: { isDatabase: true },
      select: {
        id: true,
        title: true,
        icon: true,
        isArchived: true,
        updatedAt: true,
        createdBy: { select: { id: true, name: true } },
        databaseSchema: { select: { columns: true } },
        _count: { select: { databaseRows: true } },
      },
      orderBy: { updatedAt: 'desc' },
    })

    return pages.map((p) => ({
      id: p.id,
      title: p.title,
      icon: p.icon,
      isArchived: p.isArchived,
      updatedAt: p.updatedAt,
      createdBy: p.createdBy,
      columnCount: Array.isArray(p.databaseSchema?.columns) ? p.databaseSchema.columns.length : 0,
      rowCount: p._count.databaseRows,
    }))
  })
}
