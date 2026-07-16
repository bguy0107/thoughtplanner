import { type NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = ['/login', '/signup']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow public auth pages and Next internals
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
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
