export function isAdmin(user: { role?: string | null }): boolean {
  return user.role === 'ADMIN'
}
