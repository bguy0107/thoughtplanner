// Shared types between web and api
export type Role = 'ADMIN' | 'EDITOR' | 'VIEWER'

export type PageSummary = {
  id: string
  workspaceId: string
  parentPageId: string | null
  title: string
  icon: string | null
  isDatabase: boolean
  position: number
  updatedAt: string
}

export type WorkspaceRole = 'ADMIN' | 'EDITOR' | 'VIEWER'

export type Workspace = {
  id: string
  name: string
  icon: string | null
  createdAt: string
}

export type WorkspaceMembership = Workspace & {
  role: WorkspaceRole
}

export type WorkspaceMemberSummary = {
  id: string
  userId: string
  role: WorkspaceRole
  createdAt: string
  user: {
    id: string
    name: string
    email: string
    image: string | null
  }
}
