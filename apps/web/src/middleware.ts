import { type NextRequest, NextResponse } from 'next/server'

// /share/* is the public page-viewing route (see app/share/[id]/page.tsx) —
// it's meant to be reachable by logged-out visitors, so it must be exempt
// from the session-cookie gate below like the auth pages are.
const PUBLIC_PATHS = ['/login', '/signup', '/share']

// Exact-segment match so a future route sharing a prefix (e.g. `/login-help`)
// doesn't accidentally bypass the session gate below — startsWith alone would
// treat any of these as a public path too.
function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow public auth pages and Next internals
  if (
    isPublicPath(pathname) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next()
  }

  // Better Auth names this cookie 'better-auth.session_token', but prefixes it with
  // '__Secure-' whenever the app runs in production or behind HTTPS.
  const session =
    req.cookies.get('better-auth.session_token') ??
    req.cookies.get('__Secure-better-auth.session_token')
  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
