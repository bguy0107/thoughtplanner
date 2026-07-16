import { randomUUID } from 'crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { Prisma } from '@prisma/client'
import AdmZip from 'adm-zip'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { prisma } from '../lib/prisma.js'
import { auth } from '../lib/auth.js'
import { isViewer } from '../lib/permissions.js'

interface SpreadsheetColumn {
  id: string
  name: string
  type: string
  options?: string[]
}

async function getSession(req: FastifyRequest) {
  return auth.api.getSession({ headers: req.headers as unknown as Headers })
}

/** Convert a minimal markdown string to a TipTap doc (no DOM required). */
function markdownToTiptap(md: string): object {
  const lines = md.split('\n')
  const content: object[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const h = line.match(/^(#{1,3})\s+(.+)/)
    if (h) {
      content.push({ type: 'heading', attrs: { level: h[1].length }, content: [{ type: 'text', text: h[2] }] })
      continue
    }

    const hr = line.match(/^---+$/)
    if (hr) { content.push({ type: 'horizontalRule' }); continue }

    const ul = line.match(/^[-*]\s+(.+)/)
    if (ul) {
      content.push({ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: ul[1] }] }] }] })
      continue
    }

    const ol = line.match(/^\d+\.\s+(.+)/)
    if (ol) {
      content.push({ type: 'orderedList', attrs: { start: 1 }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: ol[1] }] }] }] })
      continue
    }

    if (line.trim() === '') continue

    content.push({ type: 'paragraph', content: [{ type: 'text', text: line }] })
  }

  return { type: 'doc', content }
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
  // POST /api/import/notion — accepts multipart zip upload
  app.post('/api/import/notion', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })
    if (isViewer(session.user)) return reply.status(403).send({ error: 'Viewers cannot import content' })

    const data = await req.file()
    if (!data) return reply.status(400).send({ error: 'No file uploaded' })

    const buf = await data.toBuffer()
    let zip: AdmZip
    try {
      zip = new AdmZip(buf)
    } catch {
      return reply.status(400).send({ error: 'Invalid zip file' })
    }

    const entries = zip.getEntries()

    // Guard against zip bombs: a small compressed upload can expand to
    // gigabytes and exhaust memory during extraction. Cap total uncompressed
    // size rather than trusting the compressed upload size alone.
    const MAX_UNCOMPRESSED_BYTES = 500 * 1024 * 1024
    const totalUncompressed = entries.reduce((sum, e) => sum + e.header.size, 0)
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
      return reply.status(400).send({ error: 'Zip contents too large to import' })
    }
    const mdFiles = entries.filter((e) => e.entryName.endsWith('.md') && !e.isDirectory)
    const csvFiles = entries.filter((e) => e.entryName.endsWith('.csv') && !e.isDirectory)

    let pagesCreated = 0
    let databasesCreated = 0
    const errors: string[] = []

    // Map from base name (without extension) to created page ID
    const pageIdByName = new Map<string, string>()

    // Process markdown pages first
    for (const entry of mdFiles) {
      try {
        const rawName = entry.entryName.split('/').pop()!
        const baseName = rawName.replace(/\.md$/, '').replace(/ [a-f0-9]{32}$/, '').trim()

        const mdText = entry.getData().toString('utf-8')
        const lines = mdText.split('\n')
        const firstHeading = lines.find((l) => l.startsWith('# '))
        const title = firstHeading ? firstHeading.replace(/^# /, '').trim() : baseName

        // Strip properties block Notion sometimes prepends (key: value lines at top)
        let bodyStart = 0
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith('# ') || lines[i].trim() === '') { bodyStart = i + 1; break }
        }
        const body = lines.slice(bodyStart).join('\n').trim()

        // Determine if a matching CSV exists → it will be a database
        const hasMatchingCsv = csvFiles.some((c) => {
          const csvBase = c.entryName.split('/').pop()!.replace(/\.csv$/, '').replace(/ [a-f0-9]{32}$/, '').trim()
          return csvBase === baseName
        })

        // Position at end of existing pages
        const siblings = await prisma.page.findMany({
          where: { parentPageId: null, isArchived: false },
          select: { position: true },
          orderBy: { position: 'desc' },
          take: 1,
        })
        const position = siblings[0] ? siblings[0].position + 1 : 0

        const page = await prisma.page.create({
          data: {
            title,
            content: body ? (markdownToTiptap(body) as Prisma.InputJsonValue) : Prisma.JsonNull,
            isDatabase: hasMatchingCsv,
            position,
            createdById: session.user.id,
            updatedById: session.user.id,
          },
        })

        pageIdByName.set(baseName, page.id)
        pagesCreated++
      } catch (e) {
        errors.push(`Page "${entry.entryName}": ${String(e)}`)
      }
    }

    // Process CSV files as database content
    for (const entry of csvFiles) {
      try {
        const rawName = entry.entryName.split('/').pop()!
        const baseName = rawName.replace(/\.csv$/, '').replace(/ [a-f0-9]{32}$/, '').trim()
        const pageId = pageIdByName.get(baseName)
        if (!pageId) continue

        const csvText = entry.getData().toString('utf-8')
        const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true })
        if (!parsed.data.length) continue

        const headers = parsed.meta.fields ?? []
        const colValues: Record<string, string[]> = {}
        for (const h of headers) {
          colValues[h] = parsed.data.map((r) => r[h] ?? '')
        }

        const columns = headers.map((h) => ({
          id: randomUUID(),
          name: h,
          type: inferType(colValues[h]),
        }))

        const schema = await prisma.databaseSchema.create({
          data: { pageId, columns },
        })

        for (const rowData of parsed.data) {
          const properties: Record<string, unknown> = {}
          for (const col of columns) {
            properties[col.id] = castValue(rowData[col.name] ?? '', col.type)
          }
          await prisma.databaseRow.create({
            data: { pageId, schemaId: schema.id, properties: properties as Prisma.InputJsonValue },
          })
        }

        databasesCreated++
      } catch (e) {
        errors.push(`Database "${entry.entryName}": ${String(e)}`)
      }
    }

    return { pagesCreated, databasesCreated, errors }
  })

  // POST /api/import/spreadsheet — accepts a multipart .xlsx/.xls/.csv upload.
  // Fields (must be sent before the file part in the multipart stream):
  //   pageId       — if set, append rows to this existing database instead of creating a new one
  //   parentPageId — if set (and pageId isn't), nest the newly created database page under it
  app.post('/api/import/spreadsheet', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })
    if (isViewer(session.user)) return reply.status(403).send({ error: 'Viewers cannot import content' })

    const data = await req.file()
    if (!data) return reply.status(400).send({ error: 'No file uploaded' })

    const fields = data.fields as Record<string, { value?: unknown } | undefined>
    const targetPageId = typeof fields.pageId?.value === 'string' && fields.pageId.value ? fields.pageId.value : undefined
    const parentPageId = typeof fields.parentPageId?.value === 'string' && fields.parentPageId.value ? fields.parentPageId.value : undefined

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

      const columns = schema.columns as unknown as SpreadsheetColumn[]
      const byName = new Map(columns.map((c) => [c.name.trim().toLowerCase(), c]))

      let columnsAdded = 0
      const headerColumns = headers.map((h) => {
        const existing = byName.get(h.trim().toLowerCase())
        if (existing) return existing
        const created: SpreadsheetColumn = { id: randomUUID(), name: h, type: inferType(colValues[h]) }
        columns.push(created)
        byName.set(h.trim().toLowerCase(), created)
        columnsAdded++
        return created
      })

      if (columnsAdded > 0) {
        await prisma.databaseSchema.update({
          where: { id: schema.id },
          data: { columns: columns as unknown as Prisma.InputJsonValue },
        })
      }

      for (const rowData of rows) {
        const properties: Record<string, unknown> = {}
        headers.forEach((h, i) => {
          properties[headerColumns[i].id] = castForColumn(rowData[h] ?? '', headerColumns[i])
        })
        await prisma.databaseRow.create({
          data: { pageId: targetPageId, schemaId: schema.id, properties: properties as Prisma.InputJsonValue },
        })
      }

      return { pageId: targetPageId, rowsCreated: rows.length, columnsAdded }
    }

    // Create a brand-new database page from the spreadsheet.
    const title = (data.filename ?? 'Untitled').replace(/\.(xlsx|xls|csv)$/i, '')

    const siblings = await prisma.page.findMany({
      where: { parentPageId: parentPageId ?? null, isArchived: false },
      select: { position: true },
      orderBy: { position: 'desc' },
      take: 1,
    })
    const position = siblings[0] ? siblings[0].position + 1 : 0

    const page = await prisma.page.create({
      data: {
        title,
        isDatabase: true,
        parentPageId: parentPageId ?? null,
        position,
        createdById: session.user.id,
        updatedById: session.user.id,
      },
    })

    const columns: SpreadsheetColumn[] = headers.map((h) => ({
      id: randomUUID(),
      name: h,
      type: inferType(colValues[h]),
    }))

    const schema = await prisma.databaseSchema.create({
      data: { pageId: page.id, columns: columns as unknown as Prisma.InputJsonValue },
    })

    for (const rowData of rows) {
      const properties: Record<string, unknown> = {}
      for (const col of columns) {
        properties[col.id] = castValue(rowData[col.name] ?? '', col.type as 'text' | 'number' | 'checkbox' | 'date')
      }
      await prisma.databaseRow.create({
        data: { pageId: page.id, schemaId: schema.id, properties: properties as Prisma.InputJsonValue },
      })
    }

    return reply.status(201).send({ page, rowsCreated: rows.length })
  })
}
