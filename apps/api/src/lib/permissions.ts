export function isViewer(user: { role?: string | null }): boolean {
  return user.role === 'VIEWER'
}
