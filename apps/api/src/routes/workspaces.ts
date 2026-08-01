import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { auth } from '../lib/auth.js'
import { requireWorkspaceMember } from '../lib/workspace.js'

async function getSession(req: FastifyRequest) {
  return auth.api.getSession({ headers: req.headers as unknown as Headers })
}

const CreateWorkspaceSchema = z.object({
  name: z.string().min(1),
  icon: z.string().optional(),
})

const UpdateWorkspaceSchema = z.object({
  name: z.string().min(1).optional(),
  icon: z.string().nullable().optional(),
})

const AddMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['ADMIN', 'EDITOR', 'VIEWER']).default('EDITOR'),
})

const SetMemberRoleSchema = z.object({
  role: z.enum(['ADMIN', 'EDITOR', 'VIEWER']),
})

const memberSelect = {
  id: true,
  userId: true,
  role: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true, image: true } },
} as const

export async function workspaceRoutes(app: FastifyInstance) {
  // GET /api/workspaces — workspaces the caller belongs to, with their role in each
  app.get('/api/workspaces', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: session.user.id },
      select: { role: true, workspace: true },
      orderBy: { createdAt: 'asc' },
    })

    return memberships.map((m) => ({ ...m.workspace, role: m.role }))
  })

  // POST /api/workspaces — create a workspace; caller becomes its ADMIN
  app.post('/api/workspaces', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const body = CreateWorkspaceSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const workspace = await prisma.$transaction(async (tx) => {
      const ws = await tx.workspace.create({ data: { name: body.data.name, icon: body.data.icon } })
      await tx.workspaceMember.create({
        data: { workspaceId: ws.id, userId: session.user.id, role: 'ADMIN' },
      })
      return ws
    })

    return reply.status(201).send({ ...workspace, role: 'ADMIN' as const })
  })

  // GET /api/workspaces/:id
  app.get<{ Params: { id: string } }>('/api/workspaces/:id', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const access = await requireWorkspaceMember(session.user.id, req.params.id)
    if (!access.ok) return reply.status(access.status).send({ error: access.error })

    const workspace = await prisma.workspace.findUnique({ where: { id: req.params.id } })
    if (!workspace) return reply.status(404).send({ error: 'Not found' })

    return { ...workspace, role: access.membership.role }
  })

  // PATCH /api/workspaces/:id — ADMIN only
  app.patch<{ Params: { id: string } }>('/api/workspaces/:id', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const access = await requireWorkspaceMember(session.user.id, req.params.id, 'ADMIN')
    if (!access.ok) return reply.status(access.status).send({ error: access.error })

    const body = UpdateWorkspaceSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const workspace = await prisma.workspace.update({ where: { id: req.params.id }, data: body.data })
    return workspace
  })

  // DELETE /api/workspaces/:id — ADMIN only, must have no pages at all
  app.delete<{ Params: { id: string } }>('/api/workspaces/:id', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const access = await requireWorkspaceMember(session.user.id, req.params.id, 'ADMIN')
    if (!access.ok) return reply.status(access.status).send({ error: access.error })

    // Page.workspace is onDelete: Restrict, and that FK is still held by
    // archived-but-not-purged pages — so this must count ALL pages, not just
    // non-archived ones, or workspace.delete() below throws an unhandled
    // FK-violation 500 instead of this clean 409.
    const remainingPages = await prisma.page.count({
      where: { workspaceId: req.params.id },
    })
    if (remainingPages > 0) {
      return reply.status(409).send({ error: 'Delete or purge all pages (including trashed ones) before deleting the workspace' })
    }

    await prisma.workspace.delete({ where: { id: req.params.id } })
    return reply.status(204).send()
  })

  // GET /api/workspaces/:id/members
  app.get<{ Params: { id: string } }>('/api/workspaces/:id/members', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const access = await requireWorkspaceMember(session.user.id, req.params.id)
    if (!access.ok) return reply.status(access.status).send({ error: access.error })

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: req.params.id },
      select: memberSelect,
      orderBy: { createdAt: 'asc' },
    })

    return members
  })

  // POST /api/workspaces/:id/members — add an existing user by email; ADMIN only
  app.post<{ Params: { id: string } }>('/api/workspaces/:id/members', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const access = await requireWorkspaceMember(session.user.id, req.params.id, 'ADMIN')
    if (!access.ok) return reply.status(access.status).send({ error: access.error })

    const body = AddMemberSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const user = await prisma.user.findUnique({ where: { email: body.data.email } })
    if (!user) return reply.status(404).send({ error: 'No account exists with that email' })

    const existing = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: req.params.id, userId: user.id } },
    })
    if (existing) return reply.status(409).send({ error: 'Already a member of this workspace' })

    const member = await prisma.workspaceMember.create({
      data: { workspaceId: req.params.id, userId: user.id, role: body.data.role },
      select: memberSelect,
    })

    return reply.status(201).send(member)
  })

  // PATCH /api/workspaces/:id/members/:memberId — change role; ADMIN only
  app.patch<{ Params: { id: string; memberId: string } }>(
    '/api/workspaces/:id/members/:memberId',
    async (req, reply) => {
      const session = await getSession(req)
      if (!session) return reply.status(401).send({ error: 'Unauthorized' })

      const access = await requireWorkspaceMember(session.user.id, req.params.id, 'ADMIN')
      if (!access.ok) return reply.status(access.status).send({ error: access.error })

      const body = SetMemberRoleSchema.safeParse(req.body)
      if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

      const target = await prisma.workspaceMember.findUnique({ where: { id: req.params.memberId } })
      if (!target || target.workspaceId !== req.params.id) {
        return reply.status(404).send({ error: 'Not found' })
      }

      try {
        const member = await prisma.$transaction(async (tx) => {
          if (target.role === 'ADMIN' && body.data.role !== 'ADMIN') {
            // SELECT ... FOR UPDATE locks every currently-admin row for this
            // workspace. Under concurrent requests demoting two different
            // admins, the second transaction blocks here until the first
            // commits, then re-evaluates against the now-current data — so
            // it correctly sees the reduced admin count instead of the stale
            // pre-demotion count a plain `count()` would race on.
            const admins = await tx.$queryRaw<Array<{ id: string }>>`
              SELECT id FROM "WorkspaceMember" WHERE "workspaceId" = ${req.params.id} AND role = 'ADMIN' FOR UPDATE
            `
            if (admins.length <= 1) {
              throw new Error('LAST_ADMIN')
            }
          }

          return tx.workspaceMember.update({
            where: { id: req.params.memberId },
            data: { role: body.data.role },
            select: memberSelect,
          })
        })

        return member
      } catch (err) {
        if (err instanceof Error && err.message === 'LAST_ADMIN') {
          return reply.status(409).send({ error: 'Workspace must have at least one admin' })
        }
        throw err
      }
    },
  )

  // DELETE /api/workspaces/:id/members/:memberId — ADMIN, or a member removing themself
  app.delete<{ Params: { id: string; memberId: string } }>(
    '/api/workspaces/:id/members/:memberId',
    async (req, reply) => {
      const session = await getSession(req)
      if (!session) return reply.status(401).send({ error: 'Unauthorized' })

      const target = await prisma.workspaceMember.findUnique({ where: { id: req.params.memberId } })
      if (!target || target.workspaceId !== req.params.id) {
        return reply.status(404).send({ error: 'Not found' })
      }

      const isSelf = target.userId === session.user.id
      if (!isSelf) {
        const access = await requireWorkspaceMember(session.user.id, req.params.id, 'ADMIN')
        if (!access.ok) return reply.status(access.status).send({ error: access.error })
      }

      try {
        await prisma.$transaction(async (tx) => {
          if (target.role === 'ADMIN') {
            // See the matching comment in the PATCH role-change route above —
            // this lock prevents two concurrent removals from both reading a
            // stale admin count and jointly zeroing out the workspace's admins.
            const admins = await tx.$queryRaw<Array<{ id: string }>>`
              SELECT id FROM "WorkspaceMember" WHERE "workspaceId" = ${req.params.id} AND role = 'ADMIN' FOR UPDATE
            `
            if (admins.length <= 1) {
              throw new Error('LAST_ADMIN')
            }
          }

          await tx.workspaceMember.delete({ where: { id: req.params.memberId } })
        })

        return reply.status(204).send()
      } catch (err) {
        if (err instanceof Error && err.message === 'LAST_ADMIN') {
          return reply.status(409).send({ error: 'Workspace must have at least one admin' })
        }
        throw err
      }
    },
  )
}
