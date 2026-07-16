import type { FastifyInstance } from 'fastify'
import { toNodeHandler } from 'better-auth/node'
import { auth } from '../lib/auth.js'

const handler = toNodeHandler(auth)
const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(',')

export async function authRoutes(app: FastifyInstance) {
  // Don't use parseAs:'buffer' — that causes Fastify to consume the body stream before
  // better-auth can read it. Receiving the stream and calling done(null) without reading
  // it leaves req.raw intact for toNodeHandler.
  app.addContentTypeParser(
    ['application/json', 'text/plain'],
    (_req, _payload, done) => done(null),
  )

  app.all('/api/auth/*', (req, reply) => {
    // @fastify/cors stores CORS headers via reply.header(), which only gets flushed to
    // reply.raw when Fastify sends the response. Since better-auth writes to reply.raw
    // directly (bypassing Fastify's onSend hook), we must set them on reply.raw here so
    // they're present on error responses too — otherwise the browser sees a CORS failure
    // and throws "Failed to fetch" instead of surfacing the actual error.
    const origin = req.headers.origin
    if (origin && allowedOrigins.includes(origin)) {
      reply.raw.setHeader('Access-Control-Allow-Origin', origin)
      reply.raw.setHeader('Access-Control-Allow-Credentials', 'true')
      reply.raw.setHeader('Vary', 'Origin')
    }
    handler(req.raw, reply.raw)
  })
}
