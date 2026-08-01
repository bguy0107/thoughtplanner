import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { auth } from '../lib/auth.js'
import { requirePageAccess, touchPage } from '../lib/workspace.js'

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
const UpdateRowBodySchema = z.object({
  properties: z.record(z.unknown()).optional(),
  position: z.number().optional(),
})

async function computeRollups(
  columns: Col[],
  rows: Array<{ id: string; properties: unknown }>,
  userId: string,
): Promise<Array<{ id: string; properties: unknown }>> {
  const rollupCols = columns.filter((c) => c.type === 'rollup' && c.relationColId && c.targetColId && c.operation)
  if (rollupCols.length === 0) return rows

  // A relation column's targetPageId is only trustworthy if the requesting user
  // still has access to that page — otherwise a schema could point a relation at
  // a page/workspace the viewer has no business reading rollup values from.
  const targetPageIdByRelColId = new Map<string, string>()
  for (const col of rollupCols) {
    const relCol = columns.find((c) => c.id === col.relationColId && c.type === 'relation')
    if (!relCol?.targetPageId) continue
    if (targetPageIdByRelColId.has(relCol.id)) continue
    const access = await requirePageAccess(userId, relCol.targetPageId)
    if (access.ok) targetPageIdByRelColId.set(relCol.id, relCol.targetPageId)
  }

  // Gather every related row id referenced by an accessible relation column,
  // and resolve them in a single query instead of one per (row, column) pair.
  const allRelatedIds = new Set<string>()
  for (const row of rows) {
    const props = row.properties as Record<string, unknown>
    for (const relColId of targetPageIdByRelColId.keys()) {
      const relatedIds = props[relColId]
      if (Array.isArray(relatedIds)) {
        for (const id of relatedIds as string[]) allRelatedIds.add(id)
      }
    }
  }

  const relatedRows = allRelatedIds.size
    ? await prisma.databaseRow.findMany({
        where: { id: { in: [...allRelatedIds] }, pageId: { in: [...new Set(targetPageIdByRelColId.values())] } },
        select: { id: true, pageId: true, properties: true },
      })
    : []
  const relatedById = new Map(relatedRows.map((r) => [r.id, r]))

  return rows.map((row) => {
    const props = { ...(row.properties as Record<string, unknown>) }

    for (const col of rollupCols) {
      const relCol = columns.find((c) => c.id === col.relationColId && c.type === 'relation')
      const targetPageId = relCol && targetPageIdByRelColId.get(relCol.id)
      if (!relCol || !col.targetColId || !col.operation || !targetPageId) {
        if (col.operation) props[col.id] = col.operation === 'count' ? 0 : null
        continue
      }

      const relatedIds = props[relCol.id]
      if (!Array.isArray(relatedIds) || relatedIds.length === 0) {
        props[col.id] = col.operation === 'count' ? 0 : null
        continue
      }

      // Only honor related ids that actually resolve to a row on the relation's
      // configured (and access-checked) target page — a row property is
      // client-controlled and must not be trusted to point wherever it claims.
      const matched = (relatedIds as string[])
        .map((id) => relatedById.get(id))
        .filter((r): r is NonNullable<typeof r> => r != null && r.pageId === targetPageId)
        .map((r) => r.properties as Record<string, unknown>)
      const vals = matched.map((p) => p[col.targetColId!]).filter((v) => v != null)

      if (col.operation === 'count') {
        props[col.id] = matched.length
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
  })
}

export async function databaseRoutes(app: FastifyInstance) {
  // GET /api/databases/:pageId — schema + all rows (with rollup computation)
  app.get<{ Params: { pageId: string } }>('/api/databases/:pageId', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const access = await requirePageAccess(session.user.id, req.params.pageId)
    if (!access.ok) return reply.status(access.status).send({ error: access.error })

    const schema = await prisma.databaseSchema.findUnique({
      where: { pageId: req.params.pageId },
      include: { rows: { orderBy: { position: 'asc' } } },
    })

    if (!schema) return reply.status(404).send({ error: 'Not found' })

    const columns = schema.columns as Col[]
    const rows = await computeRollups(columns, schema.rows, session.user.id)

    return { ...schema, rows }
  })

  // GET /api/databases/:pageId/related-rows?ids=id1,id2 — resolve row IDs to display names
  app.get<{ Params: { pageId: string }; Querystring: { ids?: string } }>(
    '/api/databases/:pageId/related-rows',
    async (req, reply) => {
      const session = await getSession(req)
      if (!session) return reply.status(401).send({ error: 'Unauthorized' })

      const access = await requirePageAccess(session.user.id, req.params.pageId)
      if (!access.ok) return reply.status(access.status).send({ error: access.error })

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

    const access = await requirePageAccess(session.user.id, req.params.pageId, 'EDITOR')
    if (!access.ok) return reply.status(access.status).send({ error: access.error })

    const body = UpdateSchemaBodySchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    // A relation column can only point at a page this editor can actually see —
    // otherwise rollups built on top of it would leak data from elsewhere.
    const targetPageIds = new Set(
      body.data.columns.filter((c) => c.type === 'relation' && c.targetPageId).map((c) => c.targetPageId!),
    )
    for (const targetPageId of targetPageIds) {
      const targetAccess = await requirePageAccess(session.user.id, targetPageId)
      if (!targetAccess.ok) {
        return reply.status(400).send({ error: `No access to relation target page ${targetPageId}` })
      }
    }

    const schema = await prisma.$transaction(async (tx) => {
      // The client's `columns` array reflects a possibly-stale snapshot and
      // is a full positional replace (needed for reordering), so it can't be
      // merged against a concurrent writer without risking silently
      // resurrecting a column someone else just deleted. FOR UPDATE at least
      // makes the two writers' updates atomic instead of interleaved; see
      // the spreadsheet-append path in import.ts for the complementary
      // "additive only" side of this race, which merges safely because it
      // never removes columns.
      await tx.$executeRaw`SELECT id FROM "DatabaseSchema" WHERE "pageId" = ${req.params.pageId} FOR UPDATE`

      return tx.databaseSchema.update({
        where: { pageId: req.params.pageId },
        data: { columns: body.data.columns },
      })
    })
    await touchPage(req.params.pageId, session.user.id)

    return schema
  })

  // POST /api/databases/:pageId/rows — create a row
  app.post<{ Params: { pageId: string } }>('/api/databases/:pageId/rows', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const access = await requirePageAccess(session.user.id, req.params.pageId, 'EDITOR')
    if (!access.ok) return reply.status(access.status).send({ error: access.error })

    const body = CreateRowBodySchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const schema = await prisma.databaseSchema.findUnique({ where: { pageId: req.params.pageId } })
    if (!schema) return reply.status(404).send({ error: 'No schema' })

    const row = await prisma.$transaction(async (tx) => {
      // Same "read max, then insert at max+1" race as page creation — serialize
      // per pageId so two concurrent row creates can't both land on the same position.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`row-position:${req.params.pageId}`}))`

      const last = await tx.databaseRow.findFirst({
        where: { pageId: req.params.pageId },
        select: { position: true },
        orderBy: { position: 'desc' },
      })

      return tx.databaseRow.create({
        data: {
          pageId: req.params.pageId,
          schemaId: schema.id,
          properties: body.data.properties as Prisma.InputJsonValue,
          position: last ? last.position + 1 : 0,
        },
      })
    })
    await touchPage(req.params.pageId, session.user.id)

    return reply.status(201).send(row)
  })

  // PATCH /api/databases/rows/:rowId — update row properties
  app.patch<{ Params: { rowId: string } }>('/api/databases/rows/:rowId', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const existing = await prisma.databaseRow.findUnique({
      where: { id: req.params.rowId },
      select: { pageId: true },
    })
    if (!existing) return reply.status(404).send({ error: 'Not found' })

    const access = await requirePageAccess(session.user.id, existing.pageId, 'EDITOR')
    if (!access.ok) return reply.status(access.status).send({ error: access.error })

    const body = UpdateRowBodySchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const { properties, position } = body.data

    const row = await prisma.$transaction(async (tx) => {
      // `properties` is a partial patch (see api.ts / TableView etc. — callers
      // now send only the field(s) they changed, not the whole object) and is
      // merged into the current row here, inside a lock, rather than replacing
      // it wholesale. That closes the lost-update race where two edits to
      // different fields of the same row (e.g. tabbing from a text cell to a
      // checkbox) fire close together: without the lock+merge, whichever
      // request's full-object snapshot landed last would silently overwrite
      // the other's field.
      const [locked] = await tx.$queryRaw<Array<{ properties: Record<string, unknown> }>>`
        SELECT properties FROM "DatabaseRow" WHERE id = ${req.params.rowId} FOR UPDATE
      `
      const mergedProperties = properties !== undefined
        ? { ...(locked?.properties ?? {}), ...properties }
        : undefined

      return tx.databaseRow.update({
        where: { id: req.params.rowId },
        data: {
          ...(mergedProperties !== undefined ? { properties: mergedProperties as Prisma.InputJsonValue } : {}),
          ...(position !== undefined ? { position } : {}),
        },
      })
    })
    // A pure position change is a drag-to-reorder, not an edit — don't bump
    // "last modified" for that, only for actual property changes.
    if (properties !== undefined) await touchPage(existing.pageId, session.user.id)

    return row
  })

  // DELETE /api/databases/rows/:rowId — delete a row
  app.delete<{ Params: { rowId: string } }>('/api/databases/rows/:rowId', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const existing = await prisma.databaseRow.findUnique({
      where: { id: req.params.rowId },
      select: { pageId: true },
    })
    if (!existing) return reply.status(404).send({ error: 'Not found' })

    const access = await requirePageAccess(session.user.id, existing.pageId, 'EDITOR')
    if (!access.ok) return reply.status(access.status).send({ error: access.error })

    await prisma.databaseRow.delete({ where: { id: req.params.rowId } })
    await touchPage(existing.pageId, session.user.id)
    return reply.status(204).send()
  })
}
