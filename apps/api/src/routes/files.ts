import type { FastifyInstance, FastifyRequest } from 'fastify'
import { randomUUID } from 'crypto'
import { prisma } from '../lib/prisma.js'
import { auth } from '../lib/auth.js'
import { minio, BUCKET, fileUrl } from '../lib/minio.js'
import { requirePageAccess } from '../lib/workspace.js'

type DbFile = NonNullable<Awaited<ReturnType<typeof prisma.file.findUnique>>>

async function getSession(req: FastifyRequest) {
  return auth.api.getSession({ headers: req.headers as unknown as Headers })
}

function withUrl(file: DbFile) {
  return { ...file, url: fileUrl(file.storageKey) }
}

// The MinIO bucket serves objects with public read access so uploaded images
// can be embedded directly in pages. Any type capable of executing script in
// a browser (html, svg, xml, js, ...) must never be served with a matching
// Content-Type + inline disposition, or a stored file becomes stored XSS on
// the app's own origin. Only a small allowlist of genuinely inert types is
// served inline; everything else is forced to download as an opaque blob.
const INLINE_SAFE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/x-icon',
  'application/pdf',
])

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\- ]/g, '_')
}

function uploadMetadata(filename: string, mimetype: string): Record<string, string> {
  const safe = INLINE_SAFE_TYPES.has(mimetype)
  return {
    'Content-Type': safe ? mimetype : 'application/octet-stream',
    'Content-Disposition': safe
      ? 'inline'
      : `attachment; filename="${sanitizeFilename(filename)}"`,
  }
}

export async function fileRoutes(app: FastifyInstance) {
  // POST /api/pages/:pageId/files — upload a file attached to a page
  app.post<{ Params: { pageId: string } }>(
    '/api/pages/:pageId/files',
    async (req, reply) => {
      const session = await getSession(req)
      if (!session) return reply.status(401).send({ error: 'Unauthorized' })

      const access = await requirePageAccess(session.user.id, req.params.pageId, 'EDITOR')
      if (!access.ok) return reply.status(access.status).send({ error: access.error })

      const data = await req.file()
      if (!data) return reply.status(400).send({ error: 'No file uploaded' })

      const ext = data.filename.split('.').pop() ?? ''
      const storageKey = `${req.params.pageId}/${randomUUID()}.${ext}`

      // size is unknown upfront for streams; content-type is recorded in the db.
      // metaData controls what MinIO actually serves the object as — never trust
      // the upload's declared mimetype for inline rendering (see uploadMetadata).
      await minio.putObject(
        BUCKET,
        storageKey,
        data.file,
        undefined,
        uploadMetadata(data.filename, data.mimetype),
      )

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

      const access = await requirePageAccess(session.user.id, req.params.pageId)
      if (!access.ok) return reply.status(access.status).send({ error: access.error })

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

    const access = await requirePageAccess(session.user.id, file.pageId, 'EDITOR')
    if (!access.ok) return reply.status(access.status).send({ error: access.error })

    await minio.removeObject(BUCKET, file.storageKey)
    await prisma.file.delete({ where: { id: req.params.id } })

    return reply.status(204).send()
  })
}
