-- One-time backfill for the Workspace layer added on top of Page/DatabaseSchema.
--
-- This project uses `prisma db push` (no migration history), so schema changes
-- and data backfills are applied by hand rather than via `prisma migrate`. Run
-- this once, in order, when rolling the Workspace feature out to an
-- environment that has pre-existing Users/Pages:
--
--   1. Temporarily set `Page.workspaceId` to nullable (`String?`) and the
--      `Page.workspace` relation to optional in schema.prisma, then:
--        npx prisma db push --skip-generate
--   2. Run this script against that database:
--        psql "$DATABASE_URL" -f prisma/backfill-workspaces.sql
--   3. Revert step 1 (workspaceId back to required `String`, relation back to
--      required), then:
--        npx prisma db push --skip-generate
--        npx prisma generate
--
-- Creates one "Default Workspace", adds every existing User as a member with
-- a WorkspaceRole derived from their instance-wide Role (ADMIN/EDITOR/VIEWER
-- map 1:1), and stamps that workspace onto every existing Page.

BEGIN;

INSERT INTO "Workspace" (id, name, "createdAt", "updatedAt")
VALUES ('default-workspace', 'Default Workspace', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO "WorkspaceMember" (id, "workspaceId", "userId", role, "createdAt")
SELECT md5(random()::text || clock_timestamp()::text), 'default-workspace', "id",
       "role"::text::"WorkspaceRole", now()
FROM "User"
ON CONFLICT ("workspaceId", "userId") DO NOTHING;

UPDATE "Page" SET "workspaceId" = 'default-workspace' WHERE "workspaceId" IS NULL;

COMMIT;
