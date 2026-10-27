import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname

  // Permit a design preview locally without weakening production access.
  if (
    process.env.NODE_ENV === 'development' &&
    path === '/portal/studio' &&
    request.nextUrl.searchParams.get('preview') === '1'
  ) {
    return NextResponse.next()
  }

  // Don't protect API routes or public routes
  if (
    path.startsWith('/portal/api') ||
    path.startsWith('/portal/login') ||
    path.startsWith('/portal/verify') ||
    path.startsWith('/portal/auth')
  ) {
    return NextResponse.next()
  }

  // Protect all other /portal/* routes
  if (path.startsWith('/portal')) {
    const sessionCookie = request.cookies.get('mox-session')

    // If no session cookie, redirect to login
    if (!sessionCookie) {
      return NextResponse.redirect(new URL('/portal/login', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/portal/:path*',
}
