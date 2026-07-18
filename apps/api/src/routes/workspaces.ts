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

  // DELETE /api/workspaces/:id — ADMIN only, must have no non-archived pages
  app.delete<{ Params: { id: string } }>('/api/workspaces/:id', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const access = await requireWorkspaceMember(session.user.id, req.params.id, 'ADMIN')
    if (!access.ok) return reply.status(access.status).send({ error: access.error })

    const remainingPages = await prisma.page.count({
      where: { workspaceId: req.params.id, isArchived: false },
    })
    if (remainingPages > 0) {
      return reply.status(409).send({ error: 'Archive or delete all pages before deleting the workspace' })
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

      if (target.role === 'ADMIN' && body.data.role !== 'ADMIN') {
        const adminCount = await prisma.workspaceMember.count({
          where: { workspaceId: req.params.id, role: 'ADMIN' },
        })
        if (adminCount <= 1) {
          return reply.status(409).send({ error: 'Workspace must have at least one admin' })
        }
      }

      const member = await prisma.workspaceMember.update({
        where: { id: req.params.memberId },
        data: { role: body.data.role },
        select: memberSelect,
      })

      return member
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

      if (target.role === 'ADMIN') {
        const adminCount = await prisma.workspaceMember.count({
          where: { workspaceId: req.params.id, role: 'ADMIN' },
        })
        if (adminCount <= 1) {
          return reply.status(409).send({ error: 'Workspace must have at least one admin' })
        }
      }

      await prisma.workspaceMember.delete({ where: { id: req.params.memberId } })
      return reply.status(204).send()
    },
  )
}
