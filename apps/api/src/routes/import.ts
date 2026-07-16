import { randomUUID } from 'crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import AdmZip from 'adm-zip'
import Papa from 'papaparse'
import { prisma } from '../lib/prisma.js'
import { auth } from '../lib/auth.js'

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

export async function importRoutes(app: FastifyInstance) {
  // POST /api/import/notion — accepts multipart zip upload
  app.post('/api/import/notion', async (req, reply) => {
    const session = await getSession(req)
    if (!session) return reply.status(401).send({ error: 'Unauthorized' })

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
            content: body ? markdownToTiptap(body) : null,
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
            data: { pageId, schemaId: schema.id, properties },
          })
        }

        databasesCreated++
      } catch (e) {
        errors.push(`Database "${entry.entryName}": ${String(e)}`)
      }
    }

    return { pagesCreated, databasesCreated, errors }
  })
}
