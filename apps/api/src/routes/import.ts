import { randomUUID } from 'crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { Prisma } from '@prisma/client'
import * as XLSX from 'xlsx'
import { prisma } from '../lib/prisma.js'
import { auth } from '../lib/auth.js'
import { requirePageAccess, requireWorkspaceMember, touchPage } from '../lib/workspace.js'

interface SpreadsheetColumn {
  id: string
  name: string
  type: string
  options?: string[]
}

async function getSession(req: FastifyRequest) {
  return auth.api.getSession({ headers: req.headers as unknown as Headers })
}

/** Infer column type from a CSV column's values. */
function inferType(values: string[]): 'text' | 'number' | 'checkbox' | 'date' {
  const nonEmpty = values.filter((v) => v !== '')
  if (nonEmpty.length === 0) return 'text'
  if (nonEmpty.every((v) => v === 'true' || v === 'false' || v === 'Yes' || v === 'No')) return 'checkbox'
  if (nonEmpty.every((v) => !isNaN(Number(v)))) return 'number'
  if (nonEmpty.every((v) => !isNaN(Date.parse(v)) && /\d{4}/.test(v))) return 'date'
  return 'text'
}

function castValue(raw: string, type: 'text' | 'number' | 'checkbox' | 'date'): unknown {
  if (raw === '') return null
  if (type === 'number') return Number(raw)
  if (type === 'checkbox') return raw === 'true' || raw === 'Yes'
  return raw
}

/** Cast a raw spreadsheet cell string into a value for an existing (possibly non-basic) column. */
function castForColumn(raw: string, column: SpreadsheetColumn): unknown {
  if (raw === '') return null
  switch (column.type) {
    case 'number':
      return Number(raw)
    case 'checkbox':
      return raw === 'true' || raw === 'Yes'
    case 'multi_select':
      return raw.split(',').map((v) => v.trim()).filter(Boolean)
    case 'relation':
    case 'rollup':
      // Row identity can't be resolved from spreadsheet text; leave unset.
      return null
    default:
      return raw
  }
}

/** Parse an uploaded .xlsx/.xls buffer's first sheet into header names + row records. */
function parseSpreadsheet(buf: Buffer): { headers: string[]; rows: Record<string, string>[] } {
  const workbook = XLSX.read(buf, { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined
  if (!sheet) return { headers: [], rows: [] }

  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '', raw: false })
  const headers = rows.length ? Object.keys(rows[0]) : []
  return { headers, rows }
}

export async function importRoutes(app: FastifyInstance) {
  // POST /api/import/spreadsheet — accepts a multipart .xlsx/.xls/.csv upload.
  // Fields (must be sent before the file part in the multipart stream):
  //   pageId       — if set, append rows to this existing database instead of creating a new one
  //   parentPageId — if set (and pageId isn't), nest the newly created database page under it
  //   workspaceId  — required unless pageId is set (workspace is then derived from the target page)
  app.post('/api/import/spreadsheet', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

    const data = await req.file()
    if (!data) return reply.status(400).send({ error: 'No file uploaded' })

    const fields = data.fields as Record<string, { value?: unknown } | undefined>
    const targetPageId = typeof fields.pageId?.value === 'string' && fields.pageId.value ? fields.pageId.value : undefined
    const parentPageId = typeof fields.parentPageId?.value === 'string' && fields.parentPageId.value ? fields.parentPageId.value : undefined
    const requestedWorkspaceId = typeof fields.workspaceId?.value === 'string' ? fields.workspaceId.value : undefined

    let workspaceId: string
    if (targetPageId) {
      const access = await requirePageAccess(session.user.id, targetPageId, 'EDITOR')
      if (!access.ok) return reply.status(access.status).send({ error: access.error })
      workspaceId = access.workspaceId
    } else {
      if (!requestedWorkspaceId) return reply.status(400).send({ error: 'workspaceId is required' })
      const access = await requireWorkspaceMember(session.user.id, requestedWorkspaceId, 'EDITOR')
      if (!access.ok) return reply.status(access.status).send({ error: access.error })
      workspaceId = requestedWorkspaceId

      if (parentPageId) {
        const parent = await prisma.page.findUnique({ where: { id: parentPageId }, select: { workspaceId: true, isArchived: true } })
        if (!parent) return reply.status(404).send({ error: 'Parent page not found' })
        if (parent.workspaceId !== workspaceId) {
          return reply.status(400).send({ error: 'Parent page belongs to a different workspace' })
        }
        // See the matching check in routes/pages.ts — a page created under an
        // archived parent becomes invisible and gets destroyed if that
        // ancestor is later purged.
        if (parent.isArchived) {
          return reply.status(400).send({ error: 'Cannot create a page under an archived parent' })
        }
      }
    }

    const buf = await data.toBuffer()
    let headers: string[]
    let rows: Record<string, string>[]
    try {
      ;({ headers, rows } = parseSpreadsheet(buf))
    } catch {
      return reply.status(400).send({ error: 'Invalid spreadsheet file' })
    }

    if (rows.length === 0) return reply.status(400).send({ error: 'No data rows found in spreadsheet' })

    const colValues: Record<string, string[]> = {}
    for (const h of headers) colValues[h] = rows.map((r) => r[h] ?? '')

    if (targetPageId) {
      // Append rows to an existing database, matching headers to columns by name.
      const schema = await prisma.databaseSchema.findUnique({ where: { pageId: targetPageId } })
      if (!schema) return reply.status(404).send({ error: 'Target database not found' })

      // Lock + re-read the schema row instead of trusting the `schema.columns`
      // snapshot fetched above — a manual schema edit (see the schema PATCH
      // route, which takes the same lock) could have run in between. Building
      // the merge on the freshest columns, and writing it back while still
      // holding the lock, means this append can never silently clobber a
      // concurrent column addition (its own or someone else's).
      const { columnsAdded } = await prisma.$transaction(async (tx) => {
        const [locked] = await tx.$queryRaw<Array<{ columns: SpreadsheetColumn[] }>>`
          SELECT columns FROM "DatabaseSchema" WHERE id = ${schema.id} FOR UPDATE
        `
        const columns = locked?.columns ?? (schema.columns as unknown as SpreadsheetColumn[])
        const byName = new Map(columns.map((c) => [c.name.trim().toLowerCase(), c]))

        let added = 0
        const headerColumns = headers.map((h) => {
          const existing = byName.get(h.trim().toLowerCase())
          if (existing) return existing
          const created: SpreadsheetColumn = { id: randomUUID(), name: h, type: inferType(colValues[h]) }
          columns.push(created)
          byName.set(h.trim().toLowerCase(), created)
          added++
          return created
        })

        if (added > 0) {
          await tx.databaseSchema.update({
            where: { id: schema.id },
            data: { columns: columns as unknown as Prisma.InputJsonValue },
          })
        }

        // Same position-collision risk as POST /api/databases/:pageId/rows,
        // and the same advisory lock key, so a bulk import and a single
        // manual row-add can't land on the same position either.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`row-position:${targetPageId}`}))`
        const last = await tx.databaseRow.findFirst({
          where: { pageId: targetPageId },
          select: { position: true },
          orderBy: { position: 'desc' },
        })
        let nextRowPosition = last ? last.position + 1 : 0

        const rowsToInsert = rows.map((rowData) => {
          const properties: Record<string, unknown> = {}
          headers.forEach((h, i) => {
            properties[headerColumns[i].id] = castForColumn(rowData[h] ?? '', headerColumns[i])
          })
          return {
            pageId: targetPageId,
            schemaId: schema.id,
            properties: properties as Prisma.InputJsonValue,
            position: nextRowPosition++,
          }
        })
        await tx.databaseRow.createMany({ data: rowsToInsert })

        return { columnsAdded: added }
      })
      await touchPage(targetPageId, session.user.id)

      return { pageId: targetPageId, rowsCreated: rows.length, columnsAdded }
    }

    // Create a brand-new database page from the spreadsheet.
    const title = (data.filename ?? 'Untitled').replace(/\.(xlsx|xls|csv)$/i, '')

    const page = await prisma.$transaction(async (tx) => {
      // Same sibling-position race as POST /api/pages — serialize per (workspace, parent).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${workspaceId}:${parentPageId ?? 'root'}`}))`

      const siblings = await tx.page.findMany({
        where: { workspaceId, parentPageId: parentPageId ?? null, isArchived: false },
        select: { position: true },
        orderBy: { position: 'desc' },
        take: 1,
      })
      const position = siblings[0] ? siblings[0].position + 1 : 0

      return tx.page.create({
        data: {
          workspaceId,
          title,
          isDatabase: true,
          parentPageId: parentPageId ?? null,
          position,
          createdById: session.user.id,
          updatedById: session.user.id,
        },
      })
    })

    const columns: SpreadsheetColumn[] = headers.map((h) => ({
      id: randomUUID(),
      name: h,
      type: inferType(colValues[h]),
    }))

    const schema = await prisma.databaseSchema.create({
      data: { pageId: page.id, columns: columns as unknown as Prisma.InputJsonValue },
    })

    const rowsToInsert = rows.map((rowData, i) => {
      const properties: Record<string, unknown> = {}
      for (const col of columns) {
        properties[col.id] = castValue(rowData[col.name] ?? '', col.type as 'text' | 'number' | 'checkbox' | 'date')
      }
      return { pageId: page.id, schemaId: schema.id, properties: properties as Prisma.InputJsonValue, position: i }
    })
    await prisma.databaseRow.createMany({ data: rowsToInsert })

    return reply.status(201).send({ page, rowsCreated: rows.length })
  })
}
