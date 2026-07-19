import { randomBytes } from 'crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { auth } from '../lib/auth.js'
import { isAdmin } from '../lib/permissions.js'

async function getSession(req: FastifyRequest) {
  return auth.api.getSession({ headers: req.headers as unknown as Headers })
}

const CreateInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['ADMIN', 'EDITOR', 'VIEWER']),
})

export async function inviteRoutes(app: FastifyInstance) {
  // GET /api/admin/invites — list pending + recently-used invites
  app.get('/api/admin/invites', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })
    if (!isAdmin(session.user)) return reply.status(403).send({ error: 'Admins only' })

    const invites = await prisma.invite.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        token: true,
        createdAt: true,
        usedAt: true,
        createdBy: { select: { name: true } },
        usedBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    })

    return invites
  })

  // POST /api/admin/invites — generate a single-use invite link
  app.post('/api/admin/invites', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })
    if (!isAdmin(session.user)) return reply.status(403).send({ error: 'Admins only' })

    const body = CreateInviteSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const existingUser = await prisma.user.findUnique({ where: { email: body.data.email } })
    if (existingUser) return reply.status(400).send({ error: 'A user with that email already exists' })

    // Only one pending invite per email at a time — keeps the signup hook's
    // `email + usedAt: null` lookup unambiguous.
    await prisma.invite.deleteMany({ where: { email: body.data.email, usedAt: null } })

    const token = randomBytes(24).toString('base64url')

    const invite = await prisma.invite.create({
      data: {
        email: body.data.email,
        role: body.data.role,
        token,
        createdById: session.user.id,
      },
    })

    return reply.status(201).send(invite)
  })

  // DELETE /api/admin/invites/:id — revoke a pending invite
  app.delete<{ Params: { id: string } }>('/api/admin/invites/:id', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })
    if (!isAdmin(session.user)) return reply.status(403).send({ error: 'Admins only' })

    const invite = await prisma.invite.findUnique({ where: { id: req.params.id } })
    if (!invite || invite.usedAt) return reply.status(404).send({ error: 'Not found' })

    await prisma.invite.delete({ where: { id: req.params.id } })
    return reply.status(204).send()
  })

  // GET /api/invites/:token — public lookup so the signup page can prefill
  // the email + show the assigned role before the account is created.
  app.get<{ Params: { token: string } }>('/api/invites/:token', async (req, reply) => {
    const invite = await prisma.invite.findUnique({
      where: { token: req.params.token },
      select: { email: true, role: true, usedAt: true },
    })

    if (!invite || invite.usedAt) return reply.status(404).send({ error: 'Invite not found or already used' })

    return { email: invite.email, role: invite.role }
  })
}
