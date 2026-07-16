import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { auth } from '../lib/auth.js'
import { generateApiKey } from '../lib/apiKeyAuth.js'

async function getSession(req: FastifyRequest) {
  return auth.api.getSession({ headers: req.headers as unknown as Headers })
}

const CreateKeySchema = z.object({ name: z.string().min(1).max(100) })

export async function apiKeyRoutes(app: FastifyInstance) {
  // GET /api/api-keys — list caller's keys
  app.get('/api/api-keys', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const keys = await prisma.apiKey.findMany({
      where: { userId: session.user.id },
      select: { id: true, name: true, prefix: true, createdAt: true, lastUsed: true },
      orderBy: { createdAt: 'desc' },
    })

    return keys
  })

  // POST /api/api-keys — create a new key (returns full key once)
  app.post('/api/api-keys', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const body = CreateKeySchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { full, prefix, hash } = generateApiKey()

    const key = await prisma.apiKey.create({
      data: { userId: session.user.id, name: body.data.name, keyHash: hash, prefix },
    })

    return reply.status(201).send({
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      createdAt: key.createdAt,
      key: full, // returned once, never stored in plaintext
    })
  })

  // DELETE /api/api-keys/:id — revoke a key
  app.delete<{ Params: { id: string } }>('/api/api-keys/:id', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const key = await prisma.apiKey.findUnique({ where: { id: req.params.id } })
    if (!key || key.userId !== session.user.id) return reply.status(404).send({ error: 'Not found' })

    await prisma.apiKey.delete({ where: { id: req.params.id } })
    return reply.status(204).send()
  })
}
