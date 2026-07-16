// Shared types between web and api
export type Role = 'ADMIN' | 'EDITOR' | 'VIEWER'

export type PageSummary = {
  id: string
  parentPageId: string | null
  title: string
  icon: string | null
  isDatabase: boolean
  position: number
  updatedAt: string
}
