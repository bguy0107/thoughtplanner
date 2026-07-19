import type { FastifyInstance, FastifyRequest } from 'fastify'
import { auth } from '../lib/auth.js'
import { requirePageAccess } from '../lib/workspace.js'
import { resolveEmbed } from '../lib/embeds.js'

async function getSession(req: FastifyRequest) {
  return auth.api.getSession({ headers: req.headers as unknown as Headers })
}

export async function embedRoutes(app: FastifyInstance) {
  // POST /api/pages/:pageId/embed-metadata — resolve a video/link preview for a pasted URL
  app.post<{ Params: { pageId: string }; Body: { url?: string } }>(
    '/api/pages/:pageId/embed-metadata',
    async (req, reply) => {
      const session = await getSession(req)
      if (!session) return reply.status(401).send({ error: 'Unauthorized' })

      const access = await requirePageAccess(session.user.id, req.params.pageId, 'EDITOR')
      if (!access.ok) return reply.status(access.status).send({ error: access.error })

      const url = req.body?.url
      if (!url || typeof url !== 'string') return reply.status(400).send({ error: 'url is required' })

      try {
        return await resolveEmbed(url)
      } catch (err) {
        return reply.status(422).send({ error: err instanceof Error ? err.message : 'Failed to resolve URL' })
      }
    },
  )
}
