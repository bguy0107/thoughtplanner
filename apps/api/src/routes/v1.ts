import type { FastifyInstance, FastifyRequest } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { auth } from '../lib/auth.js'
import { getApiKeyUser } from '../lib/apiKeyAuth.js'
import { requirePageAccess, requireWorkspaceMember } from '../lib/workspace.js'

async function resolveUser(req: FastifyRequest) {
  const apiKeyUser = await getApiKeyUser(req)
  if (apiKeyUser) return apiKeyUser
  const session = await auth.api.getSession({ headers: req.headers as unknown as Headers })
  return session?.user ?? null
}

/** Convert a TipTap JSON doc to plain markdown (lightweight, no DOM required). */
function tiptapToMarkdown(doc: unknown): string {
  if (!doc || typeof doc !== 'object') return ''
  const root = doc as { type: string; content?: unknown[] }
  if (root.type !== 'doc' || !root.content) return ''
  return root.content.map((n) => nodeToMd(n as Node)).join('\n\n').trim()
}

type Node = { type: string; text?: string; content?: Node[]; attrs?: Record<string, unknown>; marks?: { type: string; attrs?: Record<string, unknown> }[] }

function inlineToMd(node: Node): string {
  if (node.type === 'text') {
    let t = node.text ?? ''
    for (const mark of (node.marks ?? [])) {
      if (mark.type === 'bold') t = `**${t}**`
      else if (mark.type === 'italic') t = `*${t}*`
      else if (mark.type === 'code') t = `\`${t}\``
      else if (mark.type === 'strike') t = `~~${t}~~`
      else if (mark.type === 'underline') t = `<u>${t}</u>`
      else if (mark.type === 'link') t = `[${t}](${(mark.attrs?.href as string) ?? ''})`
    }
    return t
  }
  if (node.type === 'hardBreak') return '  \n'
  return (node.content ?? []).map(inlineToMd).join('')
}

function nodeToMd(node: Node): string {
  const inline = () => (node.content ?? []).map(inlineToMd).join('')
  const children = () => (node.content ?? []).map((n) => nodeToMd(n)).join('\n\n')

  switch (node.type) {
    case 'heading': return `${'#'.repeat((node.attrs?.level as number) ?? 1)} ${inline()}`
    case 'paragraph': return inline()
    case 'bulletList': return (node.content ?? []).map((li) => `- ${nodeToMd(li)}`).join('\n')
    case 'orderedList': return (node.content ?? []).map((li, i) => `${i + 1}. ${nodeToMd(li)}`).join('\n')
    case 'listItem': return (node.content ?? []).map((n) => nodeToMd(n)).join('\n')
    case 'taskList': return (node.content ?? []).map((li) => {
      const checked = (li.attrs?.checked as boolean) ? 'x' : ' '
      return `- [${checked}] ${(li.content ?? []).map((n) => nodeToMd(n)).join('')}`
    }).join('\n')
    case 'taskItem': return (node.content ?? []).map((n) => nodeToMd(n)).join('\n')
    case 'blockquote': return children().split('\n').map((l) => `> ${l}`).join('\n')
    case 'codeBlock': return `\`\`\`${(node.attrs?.language as string) ?? ''}\n${inline()}\n\`\`\``
    case 'horizontalRule': return '---'
    case 'image': return `![${(node.attrs?.alt as string) ?? ''}](${(node.attrs?.src as string) ?? ''})`
    default: return inline()
  }
}

export async function v1Routes(app: FastifyInstance) {
  // GET /api/v1/pages?workspaceId= — list non-archived pages
  app.get<{ Querystring: { workspaceId?: string } }>('/api/v1/pages', async (req, reply) => {
    const user = await resolveUser(req)
    if (!user) return reply.status(401).send({ error: 'Unauthorized' })

    const { workspaceId } = req.query

    let where: { isArchived: boolean; workspaceId: string | { in: string[] } }
    if (workspaceId) {
      const access = await requireWorkspaceMember(user.id, workspaceId)
      if (!access.ok) return reply.status(access.status).send({ error: access.error })
      where = { isArchived: false, workspaceId }
    } else {
      const memberships = await prisma.workspaceMember.findMany({
        where: { userId: user.id },
        select: { workspaceId: true },
      })
      where = { isArchived: false, workspaceId: { in: memberships.map((m) => m.workspaceId) } }
    }

    const pages = await prisma.page.findMany({
      where,
      select: { id: true, parentPageId: true, title: true, icon: true, isDatabase: true, position: true, updatedAt: true },
      orderBy: { position: 'asc' },
      take: 2000,
    })

    return pages
  })

  // GET /api/v1/pages/:id — full page with TipTap JSON content
  app.get<{ Params: { id: string } }>('/api/v1/pages/:id', async (req, reply) => {
    const user = await resolveUser(req)
    if (!user) return reply.status(401).send({ error: 'Unauthorized' })

    const access = await requirePageAccess(user.id, req.params.id)
    if (!access.ok) return reply.status(access.status).send({ error: access.error })

    const page = await prisma.page.findUnique({ where: { id: req.params.id } })
    if (!page) return reply.status(404).send({ error: 'Not found' })

    return page
  })

  // GET /api/v1/pages/:id/markdown — page content as markdown
  app.get<{ Params: { id: string } }>('/api/v1/pages/:id/markdown', async (req, reply) => {
    const user = await resolveUser(req)
    if (!user) return reply.status(401).send({ error: 'Unauthorized' })

    const access = await requirePageAccess(user.id, req.params.id)
    if (!access.ok) return reply.status(access.status).send({ error: access.error })

    const page = await prisma.page.findUnique({ where: { id: req.params.id } })
    if (!page) return reply.status(404).send({ error: 'Not found' })

    const md = `# ${page.title}\n\n${tiptapToMarkdown(page.content)}`
    return reply.type('text/markdown').send(md)
  })

  // GET /api/v1/databases/:id — schema + all rows
  app.get<{ Params: { id: string } }>('/api/v1/databases/:id', async (req, reply) => {
    const user = await resolveUser(req)
    if (!user) return reply.status(401).send({ error: 'Unauthorized' })

    const access = await requirePageAccess(user.id, req.params.id)
    if (!access.ok) return reply.status(access.status).send({ error: access.error })

    const schema = await prisma.databaseSchema.findUnique({
      where: { pageId: req.params.id },
      include: { rows: { orderBy: { position: 'asc' } } },
    })

    if (!schema) return reply.status(404).send({ error: 'Not found' })
    return schema
  })
}
