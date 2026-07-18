export function isViewer(user: { role?: string | null }): boolean {
  return user.role === 'VIEWER'
}

export function isAdmin(user: { role?: string | null }): boolean {
  return user.role === 'ADMIN'
}
