# Thoughtplanner — Project Progress

## Overview
Self-hosted Notion fork. Single-tenant, Docker Compose deployable (local or VPS).

**Stack:** Next.js 15 · Fastify · PostgreSQL 16 · Prisma · Better Auth · TipTap · MinIO · Redis · Caddy · pnpm workspaces

---

## Phase 1 — Foundation ✅ Complete

### Infrastructure
- [x] pnpm monorepo workspace (`apps/web`, `apps/api`, `packages/shared`)
- [x] `docker-compose.yml` — postgres, redis, minio, api, web, caddy (6 services)
- [x] `docker-compose.prod.yml` — production override (no bind mounts, standalone builds)
- [x] `Caddyfile` — HTTP locally, auto-HTTPS on VPS via Let's Encrypt
- [x] `.env.example` with all required variables documented

### API (`apps/api` — Fastify + TypeScript)
- [x] Fastify server with CORS + multipart plugins
- [x] Better Auth — email/password signup & login, 30-day sessions
- [x] Prisma schema with migrations-ready setup
- [x] `GET/POST/PATCH/DELETE /api/pages` — full page CRUD, soft-delete (archive)
- [x] `POST /api/pages/:pageId/files` — file upload to MinIO
- [x] `GET /api/pages/:pageId/files` — list page files
- [x] `DELETE /api/files/:id` — remove file from MinIO + DB
- [x] MinIO bucket auto-created on startup with public read policy
- [x] `/health` endpoint

### Database Schema (Prisma + PostgreSQL)
- [x] `User` — id, name, email, role (ADMIN/EDITOR/VIEWER), timestamps
- [x] `Session`, `Account`, `Verification` — managed by Better Auth
- [x] `Page` — id, parentPageId (self-ref tree), title, icon, coverImage, content (JSONB), isDatabase, isArchived, position, createdBy/updatedBy
- [x] `DatabaseSchema` — per-database-page column definitions (JSONB)
- [x] `DatabaseRow` — property values per row (JSONB)
- [x] `File` — pageId, storageKey, mimeType, size, uploader

### Web (`apps/web` — Next.js 15 App Router)
- [x] Route groups: `(auth)` for login/signup, `(app)` for the workspace shell
- [x] Middleware — redirects unauthenticated users to `/login`
- [x] Auth pages — `/login`, `/signup` (Better Auth client)
- [x] App shell layout — sidebar + main content area
- [x] **Sidebar** — workspace name, page tree, new page button, sign out
- [x] **Page tree** — recursive nested pages, expand/collapse, hover actions
- [x] **Page item** — active state, add sub-page, delete (soft archive), navigate
- [x] **Home page** (`/home`) — welcome screen with new page CTA
- [x] **Page view** (`/page/[id]`) — editable title + TipTap editor, loads from API
- [x] **TipTap editor** — debounced autosave (800ms), slash command menu, image upload
- [x] **Slash commands** (`/`) — Text, H1, H2, H3, Bullet List, Numbered List, To-do, Code Block, Blockquote, Divider, Image
- [x] **Image upload** — uploads to MinIO via API, inserts into editor
- [x] Zustand sidebar store — flat page list + tree builder, optimistic updates
- [x] Tailwind CSS with `@tailwindcss/typography` for prose styling

---

## Phase 2 — Databases ✅ Complete

- [x] Database page type + schema builder (add/rename/type/options per column)
- [x] Table view (inline editing with click-to-edit cells)
- [x] Column types: text, number, checkbox, date, select, multi-select
- [x] Row CRUD (create, update properties, delete)
- [x] Sort (click header cycles asc → desc → off) and filter (text search across all columns)
- [x] Board/Kanban view (grouped by first select column)
- [x] Gallery view (card grid with inline name editing)
- [x] Inline `/database` slash command (creates child database page + navigates)
- [x] "New database" button in sidebar
- [x] Database icon in sidebar for database pages

**API routes added:**
- `GET /api/databases/:pageId` — schema + rows
- `PATCH /api/databases/:pageId/schema` — update columns
- `POST /api/databases/:pageId/rows` — create row
- `PATCH /api/databases/rows/:rowId` — update row
- `DELETE /api/databases/rows/:rowId` — delete row

**Note:** Rows are standalone (not full pages). Row-as-page linking is deferred to Phase 3/4.

---

## Phase 3 — Real-time & Polish ✅ Complete

- [x] WebSocket real-time — broadcast page content to connected users (last-write-wins via `/api/ws`)
- [x] Full-text search — title search via `GET /api/search`, Ctrl+K command palette
- [x] Bubble menu — bold, italic, underline, strikethrough, code, highlight, link on text selection
- [x] Page icon picker — emoji grid popover (click icon or "Add icon")
- [x] Cover image upload — full-width cover with change/remove on hover
- [x] Public read-only page sharing — toggle public/private, copy link, `/share/[id]` route
- [x] Mobile-friendly responsive layout — hamburger menu, sidebar overlay, mobile top bar
- [x] Sidebar drag-to-reorder pages — dnd-kit sortable at root level

**New API routes added:**
- `GET /api/ws?pageId=` — WebSocket for real-time content sync
- `GET /api/search?q=` — page title search
- `GET /api/public/:id` — unauthenticated read for public pages

**New frontend files:**
- `components/editor/BubbleMenuBar.tsx` — selection toolbar
- `components/IconPicker.tsx` — emoji picker popover
- `components/SearchModal.tsx` — Ctrl+K command palette
- `hooks/usePageSync.ts` — WebSocket content sync hook
- `app/share/[id]/page.tsx` — public read-only page view

**Schema change:**
- `Page.isPublic Boolean @default(false)` — run `docker compose exec api pnpm db:push` to apply

---

## Phase 4 — Advanced ✅ Complete

- [x] Calendar view for date-typed database columns
- [x] Database relations + rollups (server-side rollup computation)
- [x] Markdown import / export (client-side via tiptap-markdown)
- [x] Notion import (ZIP upload → pages + databases)
- [x] REST API for reading your own data (API keys + /api/v1 endpoints)

**New dependencies:**
- `tiptap-markdown` (web + api) — markdown serialization/deserialization
- `adm-zip` (api) — zip extraction for Notion import
- `papaparse` (api) — CSV parsing for Notion database import

**Migration required (run once after update):**
```bash
docker compose exec api pnpm db:push
```
Adds the `ApiKey` table to the database.

**New API routes:**
- `GET/POST/DELETE /api/api-keys` — API key management
- `GET /api/v1/pages` — list all pages
- `GET /api/v1/pages/:id` — get page (TipTap JSON)
- `GET /api/v1/pages/:id/markdown` — get page as markdown
- `GET /api/v1/databases/:id` — get schema + rows
- `GET /api/databases/:pageId/related-rows?ids=...` — resolve relation row IDs to names
- `POST /api/import/notion` — Notion ZIP import

**New frontend:**
- `components/database/CalendarView.tsx` — month grid, group by date column
- `components/NotionImportModal.tsx` — drag-and-drop ZIP upload
- `app/(app)/settings/page.tsx` — API key management UI
- Calendar tab in database view switcher
- "Import from Notion" + "Settings" in sidebar footer
- Export/Import .md buttons in page hover toolbar (reveal on hover)

---

## First Boot Instructions

```bash
# 1. Generate a secret (required for auth)
echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32)" >> .env

# 2. Start all services
docker compose up -d

# 3. Push the schema to Postgres (first time only)
docker compose exec api pnpm db:push

# 4. Open the app
open http://localhost:3000
```

For VPS deployment, add to `.env`:
```
DOMAIN=yourdomain.com
```
Then: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`

Caddy will auto-provision TLS via Let's Encrypt.

---

## Key File Locations

| What | Where |
|---|---|
| Docker Compose | `docker-compose.yml` |
| Environment vars | `.env` (copy from `.env.example`) |
| Prisma schema | `apps/api/prisma/schema.prisma` |
| API entry point | `apps/api/src/index.ts` |
| Auth config | `apps/api/src/lib/auth.ts` |
| Page routes | `apps/api/src/routes/pages.ts` |
| File routes | `apps/api/src/routes/files.ts` |
| TipTap editor | `apps/web/src/components/editor/Editor.tsx` |
| Sidebar | `apps/web/src/components/sidebar/` |
| Page view | `apps/web/src/app/(app)/page/[id]/page.tsx` |
| API client | `apps/web/src/lib/api.ts` |
| Auth client | `apps/web/src/lib/auth-client.ts` |
| Sidebar store | `apps/web/src/store/sidebar.ts` |
