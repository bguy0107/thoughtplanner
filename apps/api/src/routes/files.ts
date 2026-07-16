import type { FastifyInstance, FastifyRequest } from 'fastify'
import { randomUUID } from 'crypto'
import { prisma } from '../lib/prisma.js'
import { auth } from '../lib/auth.js'
import { minio, BUCKET, fileUrl } from '../lib/minio.js'

type DbFile = NonNullable<Awaited<ReturnType<typeof prisma.file.findUnique>>>

async function getSession(req: FastifyRequest) {
  return auth.api.getSession({ headers: req.headers as unknown as Headers })
}

function withUrl(file: DbFile) {
  return { ...file, url: fileUrl(file.storageKey) }
}

export async function fileRoutes(app: FastifyInstance) {
  // POST /api/pages/:pageId/files — upload a file attached to a page
  app.post<{ Params: { pageId: string } }>(
    '/api/pages/:pageId/files',
    async (req, reply) => {
      const session = await getSession(req)
      if (!session) return reply.status(401).send({ error: 'Unauthorized' })

      const data = await req.file()
      if (!data) return reply.status(400).send({ error: 'No file uploaded' })

      const ext = data.filename.split('.').pop() ?? ''
      const storageKey = `${req.params.pageId}/${randomUUID()}.${ext}`

      // size is unknown upfront for streams; content-type is recorded in the db
      await minio.putObject(BUCKET, storageKey, data.file)

      const stat = await minio.statObject(BUCKET, storageKey)

      const file = await prisma.file.create({
        data: {
          pageId: req.params.pageId,
          uploaderId: session.user.id,
          filename: data.filename,
          mimeType: data.mimetype,
          size: Number(stat.size),
          storageKey,
        },
      })

      return reply.status(201).send(withUrl(file))
    },
  )

  // GET /api/pages/:pageId/files — list files for a page
  app.get<{ Params: { pageId: string } }>(
    '/api/pages/:pageId/files',
    async (req, reply) => {
      const session = await getSession(req)
      if (!session) return reply.status(401).send({ error: 'Unauthorized' })

      const files = await prisma.file.findMany({
        where: { pageId: req.params.pageId },
        orderBy: { createdAt: 'desc' },
      })

      return files.map(withUrl)
    },
  )

  // DELETE /api/files/:id
  app.delete<{ Params: { id: string } }>('/api/files/:id', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const file = await prisma.file.findUnique({ where: { id: req.params.id } })
    if (!file) return reply.status(404).send({ error: 'Not found' })

    await minio.removeObject(BUCKET, file.storageKey)
    await prisma.file.delete({ where: { id: req.params.id } })

    return reply.status(204).send()
  })
}
