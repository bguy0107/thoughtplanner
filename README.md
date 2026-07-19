# Thoughtplanner

A self-hosted, single-tenant Notion clone. Pages, nested databases, real-time
editing, file storage, and a full REST API — deployable with one Docker
Compose command on your home network or a VPS.

**Stack:** Next.js 15 · Fastify · PostgreSQL 16 · Prisma · Better Auth · TipTap · MinIO · Redis · Caddy · pnpm workspaces

---

## Features

### Pages & editor
- Nested page tree (infinite sub-pages), drag-to-reorder in the sidebar
- Rich text editor (TipTap) with debounced autosave
- Slash commands (`/`) — headings, lists, to-dos, code blocks, quotes, dividers, images, PDFs, files, link previews, nested databases
- Per-block drag handle — reorder any block, or click the handle to select and delete it (Backspace/Delete)
- Bubble/selection toolbar — bold, italic, underline, strikethrough, code, highlight, links (only shown for text selections, not selected blocks)
- Code blocks with syntax highlighting and a one-click copy-to-clipboard button
- Link embeds — SSRF-guarded Open Graph preview cards, with inline YouTube/Vimeo video embeds for recognized video links; plus an inline PDF viewer and downloadable file attachments
- Page icons (emoji picker) and full-width cover images
- Markdown import/export per page
- File & image uploads, stored in MinIO — including paste-to-upload images directly into the editor
- Full-text title search with a Ctrl+K command palette
- Public read-only page sharing via shareable link
- Soft-delete (archive) with admin restore/purge
- Dark mode

### Databases
- Database-type pages with a configurable schema (text, number, checkbox, date, select, multi-select, relation, rollup)
- Views: Table, Board/Kanban, Gallery, Calendar
- Table view: sticky header, locked first column, per-column filter search, click-to-cycle sort, inline cell editing
- Drag-to-reorder rows and columns
- Relations between databases + server-computed rollups
- Import from Excel/CSV spreadsheets
- Import from a Notion export (ZIP of pages + databases)

### Workspaces & collaboration
- Multiple workspaces per instance — sidebar switcher to create and jump between them
- Per-workspace membership with its own Admin / Editor / Viewer role per member, independent of the site-wide role
- Pages, databases, and sharing are scoped to the current workspace
- WebSocket sync — page content broadcasts to all connected viewers (last-write-wins)
- Email/password auth (Better Auth), 30-day sessions

### Admin & access control
- Site-wide roles: Admin / Editor / Viewer
- Admin Settings panel — manage users (role changes, deactivation), browse/restore/purge archived pages, database inventory
- Workspace Settings panel (workspace admins) — rename/delete workspace, manage member roles
- Single-use, email-bound invite links (signup is gated after the first account claims Admin)
- Personal API keys + a versioned REST API (`/api/v1`) for reading your own pages and databases as JSON or Markdown

### Infrastructure
- One `docker-compose.yml` for local/LAN use, `docker-compose.prod.yml` overlay for VPS deployment
- Caddy reverse proxy — plain HTTP locally, automatic HTTPS (Let's Encrypt) on a real domain
- Postgres for relational data, Redis for caching/pub-sub, MinIO for S3-compatible object storage

---

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose v2
- A machine to run it on: your own laptop/NAS for local/LAN use, or any VPS (2 GB RAM+ recommended) for internet access

---

## Quick start — local / home network

This runs the whole stack (Postgres, Redis, MinIO, API, Web, Caddy) on one machine, reachable from any device on your LAN via that machine's IP address.

```bash
git clone <this-repo-url>
cd thoughtplanner

# 1. Create your env file
cp .env.example .env

# 2. Generate a real auth secret and put it in .env
echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32)" >> .env

# 3. Start everything
docker compose up -d

# 4. Push the database schema (first time only)
docker compose exec api pnpm db:push

# 5. Open the app
open http://localhost:3000
```

The **first account you sign up** automatically becomes the site-wide Admin.
After that, `ALLOW_SIGNUP` in `.env` is effectively closed — invite additional
users from **Settings → Users** as Admin instead of leaving open signup on.
A new account isn't in any workspace yet — create one from the prompt on
first login (you become that workspace's Admin), or have an existing
workspace Admin add you as a member from **Settings → Members**.

### Accessing it from other devices on your network

By default the app binds to all interfaces, so anyone on your LAN can reach it
at `http://<host-machine-LAN-IP>:3000`. To make that work:

1. Find the host machine's LAN IP (e.g. `ipconfig getifaddr en0` on macOS, `ip a` on Linux).
2. In `.env`, point the public-facing URLs at that IP instead of `localhost`:
   ```
   NEXT_PUBLIC_API_URL=http://<LAN-IP>:3001
   NEXT_PUBLIC_APP_URL=http://<LAN-IP>:3000
   MINIO_PUBLIC_URL=http://<LAN-IP>:9000
   CORS_ORIGIN=http://<LAN-IP>:3000
   BETTER_AUTH_URL=http://<LAN-IP>:3001
   ```
3. Rebuild/restart so the Next.js build picks up the new `NEXT_PUBLIC_*` values:
   ```bash
   docker compose up -d --build
   ```
4. Other devices on the same network can now open `http://<LAN-IP>:3000`.

Traffic stays HTTP-only on a LAN (no public domain to get a TLS cert for) —
fine for trusted home/office networks, not for exposing the box directly to
the internet.

---

## Deploying to a VPS (with HTTPS)

1. Point a DNS **A record** for your domain at the VPS's public IP.
2. Open inbound ports `80`, `443`, `3001`, and `9000` on the VPS firewall (Caddy
   issues one Let's Encrypt certificate for the domain and reuses it across
   ports 3001/9000 for the API and file storage).
3. Clone the repo and configure `.env`:

   ```bash
   git clone <this-repo-url>
   cd thoughtplanner
   cp .env.example .env

   echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32)" >> .env
   ```

4. Edit `.env` to set your real domain and matching public URLs:

   ```
   DOMAIN=yourdomain.com

   BETTER_AUTH_URL=https://yourdomain.com:3001
   MINIO_PUBLIC_URL=https://yourdomain.com:9000
   CORS_ORIGIN=https://yourdomain.com
   NEXT_PUBLIC_API_URL=https://yourdomain.com:3001
   NEXT_PUBLIC_APP_URL=https://yourdomain.com
   ```

5. Rotate the default credentials in `.env` — `POSTGRES_PASSWORD`,
   `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` — the API refuses to start in
   production with the placeholder `BETTER_AUTH_SECRET`, and you shouldn't
   ship the example Postgres/MinIO passwords to a public host either.

6. Start the stack with the production overlay:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
   docker compose exec api pnpm db:push
   ```

Caddy will automatically request and renew a Let's Encrypt certificate for
`DOMAIN` the first time it starts (requires ports 80/443 reachable from the
internet for the ACME HTTP-01 challenge).

The production overlay builds standalone/optimized images (no source bind
mounts), so after pulling new code you need `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build` to pick it up.

---

## Updating

Whenever the Prisma schema changes (noted in commit messages / `PROGRESS.md`),
apply it after pulling:

```bash
docker compose exec api pnpm db:push
```

The workspace layer (`Page.workspaceId`) is a special case on a database that
already has users/pages in it — a plain `db:push` fails because the column is
required. See the ordered steps in `apps/api/prisma/backfill-workspaces.sql`.
A fresh/empty database doesn't need this — just run `db:push`.

---

## Useful commands

| Command | Purpose |
|---|---|
| `docker compose up -d` | Start all services (local) |
| `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` | Start all services (VPS/production) |
| `docker compose down` | Stop all services |
| `docker compose logs -f api` / `web` | Tail logs for a service |
| `docker compose exec api pnpm db:push` | Apply Prisma schema changes |
| `docker compose exec api pnpm db:studio` | Open Prisma Studio against the running DB |
| `pnpm dev` | Run `web` + `api` locally without Docker (needs local Postgres/Redis/MinIO) |

---

## Project layout

```
apps/
  web/     Next.js 15 app (App Router) — UI, editor, sidebar, settings
  api/     Fastify API — auth, pages, databases, files, admin, REST v1
packages/
  shared/  Shared TypeScript types/utilities
docker-compose.yml        Local/LAN stack (bind mounts, dev servers)
docker-compose.prod.yml   Production overlay (standalone builds, no bind mounts)
Caddyfile / Caddyfile.prod  Reverse proxy config (HTTP locally, auto-HTTPS on a domain)
.env.example              All required environment variables, documented
```

See [`PROGRESS.md`](PROGRESS.md) for the phase-by-phase build history and a
file-location index for common features.

## License

Private project — no license granted.
