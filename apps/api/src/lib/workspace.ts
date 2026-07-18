import type { WorkspaceMember, WorkspaceRole } from '@prisma/client'
import { prisma } from './prisma.js'

export const WORKSPACE_ROLE_ORDER: Record<WorkspaceRole, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2 }

export function hasWorkspaceRole(role: WorkspaceRole, minRole: WorkspaceRole): boolean {
  return WORKSPACE_ROLE_ORDER[role] >= WORKSPACE_ROLE_ORDER[minRole]
}

export function getMembership(userId: string, workspaceId: string): Promise<WorkspaceMember | null> {
  return prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  })
}

type AccessResult =
  | { ok: true; membership: WorkspaceMember }
  | { ok: false; status: 403; error: string }

// Standard route pattern (no shared Fastify pre-handler pipeline exists today —
// every route still does its own inline getSession):
//   1. const session = await getSession(req); if (!session) return 401
//   2. const access = await requireWorkspaceMember(session.user.id, workspaceId, 'EDITOR')
//      (or requirePageAccess(session.user.id, pageId, 'EDITOR') when starting from a page)
//   3. if (!access.ok) return reply.status(access.status).send({ error: access.error })
export async function requireWorkspaceMember(
  userId: string,
  workspaceId: string,
  minRole: WorkspaceRole = 'VIEWER',
): Promise<AccessResult> {
  const membership = await getMembership(userId, workspaceId)
  if (!membership) return { ok: false, status: 403, error: 'Not a member of this workspace' }
  if (!hasWorkspaceRole(membership.role, minRole)) {
    return { ok: false, status: 403, error: 'Insufficient workspace role' }
  }
  return { ok: true, membership }
}

type PageAccessResult =
  | { ok: true; workspaceId: string; membership: WorkspaceMember }
  | { ok: false; status: 403 | 404; error: string }

export async function requirePageAccess(
  userId: string,
  pageId: string,
  minRole: WorkspaceRole = 'VIEWER',
): Promise<PageAccessResult> {
  const page = await prisma.page.findUnique({ where: { id: pageId }, select: { workspaceId: true } })
  if (!page) return { ok: false, status: 404, error: 'Not found' }

  const access = await requireWorkspaceMember(userId, page.workspaceId, minRole)
  if (!access.ok) return access
  return { ok: true, workspaceId: page.workspaceId, membership: access.membership }
}
