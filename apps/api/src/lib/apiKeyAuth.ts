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

// lastUsed only needs to be accurate to within this window — coalescing writes
// to once per window avoids an UPDATE on every single API-key-authenticated
// request, which would otherwise double the DB round trips on that path.
const LAST_USED_UPDATE_INTERVAL_MS = 10 * 60 * 1000

export async function getApiKeyUser(req: FastifyRequest) {
  const raw = req.headers['x-api-key']
  if (!raw || typeof raw !== 'string') return null
  const hash = hashApiKey(raw)
  const key = await prisma.apiKey.findUnique({
    where: { keyHash: hash },
    include: { user: true },
  })
  if (!key) return null

  const isStale = !key.lastUsed || Date.now() - key.lastUsed.getTime() > LAST_USED_UPDATE_INTERVAL_MS
  if (isStale) {
    // Fire-and-forget: this bookkeeping write must not add latency to the
    // request it's authenticating, and a lost update just delays the next one.
    prisma.apiKey.update({ where: { id: key.id }, data: { lastUsed: new Date() } }).catch(() => {})
  }

  return key.user
}
