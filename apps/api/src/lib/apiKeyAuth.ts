import { createHash, randomBytes } from 'crypto'
import type { FastifyRequest } from 'fastify'
import { prisma } from './prisma.js'

export function generateApiKey(): { full: string; prefix: string; hash: string } {
  const raw = `tp_${randomBytes(32).toString('hex')}`
  const prefix = raw.slice(0, 11)
  const hash = createHash('sha256').update(raw).digest('hex')
  return { full: raw, prefix, hash }
}

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export async function getApiKeyUser(req: FastifyRequest) {
  const raw = req.headers['x-api-key']
  if (!raw || typeof raw !== 'string') return null
  const hash = hashApiKey(raw)
  const key = await prisma.apiKey.findUnique({
    where: { keyHash: hash },
    include: { user: true },
  })
  if (!key) return null
  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsed: new Date() } })
  return key.user
}
