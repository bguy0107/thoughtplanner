import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import multipart from '@fastify/multipart'
import fastifyWebSocket from '@fastify/websocket'
import { authRoutes } from './routes/auth.js'
import { pageRoutes } from './routes/pages.js'
import { fileRoutes } from './routes/files.js'
import { embedRoutes } from './routes/embeds.js'
import { databaseRoutes } from './routes/databases.js'
import { searchRoutes } from './routes/search.js'
import { publicRoutes } from './routes/public.js'
import { wsRoutes } from './routes/ws.js'
import { apiKeyRoutes } from './routes/api-keys.js'
import { v1Routes } from './routes/v1.js'
import { importRoutes } from './routes/import.js'
import { inviteRoutes } from './routes/invites.js'
import { adminRoutes } from './routes/admin.js'
import { workspaceRoutes } from './routes/workspaces.js'
import { ensureBucket } from './lib/minio.js'

if (
  process.env.NODE_ENV === 'production' &&
  (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.startsWith('change-me'))
) {
  throw new Error(
    'BETTER_AUTH_SECRET is unset or still the placeholder value — set a long random secret before running in production.',
  )
}

const app = Fastify({ logger: true })

await app.register(rateLimit, {
  max: 200,
  timeWindow: '1 minute',
})

await app.register(cors, {
  origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','),
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  credentials: true,
})

await app.register(multipart, {
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB (raised for large spreadsheet imports)
})

await app.register(fastifyWebSocket)

await app.register(authRoutes)
await app.register(pageRoutes)
await app.register(fileRoutes)
await app.register(embedRoutes)
await app.register(databaseRoutes)
await app.register(searchRoutes)
await app.register(publicRoutes)
await app.register(wsRoutes)
await app.register(apiKeyRoutes)
await app.register(v1Routes)
await app.register(importRoutes)
await app.register(inviteRoutes)
await app.register(adminRoutes)
await app.register(workspaceRoutes)

app.get('/health', async () => ({ status: 'ok' }))

try {
  await ensureBucket()
  await app.listen({
    port: parseInt(process.env.API_PORT ?? '3001'),
    host: process.env.API_HOST ?? '0.0.0.0',
  })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
