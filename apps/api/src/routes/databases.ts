import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { auth } from '../lib/auth.js'
import { isViewer } from '../lib/permissions.js'

async function getSession(req: FastifyRequest) {
  return auth.api.getSession({ headers: req.headers as unknown as Headers })
}

const ColumnSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  type: z.enum(['text', 'number', 'checkbox', 'date', 'select', 'multi_select', 'relation', 'rollup']),
  options: z.array(z.string()).optional(),
  targetPageId: z.string().optional(),   // relation
  relationColId: z.string().optional(),  // rollup
  targetColId: z.string().optional(),    // rollup
  operation: z.enum(['count', 'sum', 'avg', 'min', 'max']).optional(), // rollup
})

type Col = z.infer<typeof ColumnSchema>

const UpdateSchemaBodySchema = z.object({ columns: z.array(ColumnSchema) })
const CreateRowBodySchema = z.object({ properties: z.record(z.unknown()).default({}) })
const UpdateRowBodySchema = z.object({ properties: z.record(z.unknown()) })

async function computeRollups(
  columns: Col[],
  rows: Array<{ id: string; properties: unknown }>,
): Promise<Array<{ id: string; properties: unknown }>> {
  const rollupCols = columns.filter((c) => c.type === 'rollup' && c.relationColId && c.targetColId && c.operation)
  if (rollupCols.length === 0) return rows

  return Promise.all(
    rows.map(async (row) => {
      const props = { ...(row.properties as Record<string, unknown>) }

      for (const col of rollupCols) {
        const relCol = columns.find((c) => c.id === col.relationColId && c.type === 'relation')
        if (!relCol || !col.targetColId || !col.operation) continue

        const relatedIds = props[relCol.id]
        if (!Array.isArray(relatedIds) || relatedIds.length === 0) {
          props[col.id] = col.operation === 'count' ? 0 : null
          continue
        }

        const relatedRows = await prisma.databaseRow.findMany({
          where: { id: { in: relatedIds as string[] } },
          select: { properties: true },
        })

        const vals = relatedRows
          .map((r) => ((r.properties as Record<string, unknown>)[col.targetColId!]))
          .filter((v) => v != null)

        if (col.operation === 'count') {
          props[col.id] = relatedRows.length
        } else {
          const nums = vals.map(Number).filter((n) => !isNaN(n))
          if (nums.length === 0) { props[col.id] = null; continue }
          if (col.operation === 'sum') props[col.id] = nums.reduce((a, b) => a + b, 0)
          else if (col.operation === 'avg') props[col.id] = nums.reduce((a, b) => a + b, 0) / nums.length
          else if (col.operation === 'min') props[col.id] = Math.min(...nums)
          else if (col.operation === 'max') props[col.id] = Math.max(...nums)
        }
      }

      return { ...row, properties: props }
    }),
  )
}

export async function databaseRoutes(app: FastifyInstance) {
  // GET /api/databases/:pageId — schema + all rows (with rollup computation)
  app.get<{ Params: { pageId: string } }>('/api/databases/:pageId', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const schema = await prisma.databaseSchema.findUnique({
      where: { pageId: req.params.pageId },
      include: { rows: { orderBy: { id: 'asc' } } },
    })

    if (!schema) return reply.status(404).send({ error: 'Not found' })

    const columns = schema.columns as Col[]
    const rows = await computeRollups(columns, schema.rows)

    return { ...schema, rows }
  })

  // GET /api/databases/:pageId/related-rows?ids=id1,id2 — resolve row IDs to display names
  app.get<{ Params: { pageId: string }; Querystring: { ids?: string } }>(
    '/api/databases/:pageId/related-rows',
    async (req, reply) => {
      const session = await getSession(req)
      if (!session) return reply.status(401).send({ error: 'Unauthorized' })

      const rawIds = (req.query as { ids?: string }).ids ?? ''
      const ids = rawIds.split(',').filter(Boolean)
      if (ids.length === 0) return []

      const schema = await prisma.databaseSchema.findUnique({
        where: { pageId: req.params.pageId },
        select: { columns: true, rows: { where: { id: { in: ids } }, select: { id: true, properties: true } } },
      })
      if (!schema) return reply.status(404).send({ error: 'Not found' })

      const columns = schema.columns as Col[]
      const nameColId = columns[0]?.id

      return schema.rows.map((r) => ({
        id: r.id,
        displayName: nameColId
          ? String((r.properties as Record<string, unknown>)[nameColId] ?? 'Untitled')
          : 'Untitled',
      }))
    },
  )

  // PATCH /api/databases/:pageId/schema — update columns
  app.patch<{ Params: { pageId: string } }>('/api/databases/:pageId/schema', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })
    if (isViewer(session.user)) return reply.status(403).send({ error: 'Viewers cannot edit the schema' })

    const body = UpdateSchemaBodySchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const schema = await prisma.databaseSchema.update({
      where: { pageId: req.params.pageId },
      data: { columns: body.data.columns },
    })

    return schema
  })

  // POST /api/databases/:pageId/rows — create a row
  app.post<{ Params: { pageId: string } }>('/api/databases/:pageId/rows', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })
    if (isViewer(session.user)) return reply.status(403).send({ error: 'Viewers cannot create rows' })

    const body = CreateRowBodySchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const schema = await prisma.databaseSchema.findUnique({ where: { pageId: req.params.pageId } })
    if (!schema) return reply.status(404).send({ error: 'No schema' })

    const row = await prisma.databaseRow.create({
      data: {
        pageId: req.params.pageId,
        schemaId: schema.id,
        properties: body.data.properties as Prisma.InputJsonValue,
      },
    })

    return reply.status(201).send(row)
  })

  // PATCH /api/databases/rows/:rowId — update row properties
  app.patch<{ Params: { rowId: string } }>('/api/databases/rows/:rowId', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })
    if (isViewer(session.user)) return reply.status(403).send({ error: 'Viewers cannot edit rows' })

    const body = UpdateRowBodySchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const row = await prisma.databaseRow.update({
      where: { id: req.params.rowId },
      data: { properties: body.data.properties as Prisma.InputJsonValue },
    })

    return row
  })

  // DELETE /api/databases/rows/:rowId — delete a row
  app.delete<{ Params: { rowId: string } }>('/api/databases/rows/:rowId', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })
    if (isViewer(session.user)) return reply.status(403).send({ error: 'Viewers cannot delete rows' })

    await prisma.databaseRow.delete({ where: { id: req.params.rowId } })
    return reply.status(204).send()
  })
}
