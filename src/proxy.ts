import { NextResponse, type NextRequest } from 'next/server'

import { prisma } from '@/lib/prisma'

import { getAuthConfig } from '@/lib/auth/config'
import { AUTH_SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session'

const PUBLIC_AUTH_PATHS = new Set([
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
])

function unauthorizedApiResponse() {
  return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
}

function loginRedirect(request: NextRequest, configurationError = false) {
  const url = new URL('/login', request.url)
  const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`

  if (returnTo !== '/' && returnTo.length <= 2_048) {
    url.searchParams.set('next', returnTo)
  }
  if (configurationError) {
    url.searchParams.set('error', 'configuration')
  }

  return NextResponse.redirect(url)
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const authConfig = getAuthConfig()
  const token = request.cookies.get(AUTH_SESSION_COOKIE)?.value
  const userId = authConfig ? await verifySessionToken(token, authConfig.secret) : null
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { status: true } })
    : null
  const authenticated = user?.status === 'active'

  function discardInvalidSession(response: NextResponse) {
    if (token && !authenticated) response.cookies.delete(AUTH_SESSION_COOKIE)
    return response
  }

  if (pathname === '/login') {
    if (authenticated) return NextResponse.redirect(new URL('/', request.url))
    return discardInvalidSession(NextResponse.next())
  }

  if (PUBLIC_AUTH_PATHS.has(pathname)) {
    return NextResponse.next()
  }

  if (!authConfig) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Authentication is not configured' },
        { status: 503 },
      )
    }
    return loginRedirect(request, true)
  }

  if (authenticated) return NextResponse.next()
  if (pathname.startsWith('/api/')) return discardInvalidSession(unauthorizedApiResponse())
  return discardInvalidSession(loginRedirect(request))
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|manifest.webmanifest|story-offline.html|apple-touch-icon.png|icon.svg|icon-192.png|icon-192-maskable.png|icon-512.png|icon-512-maskable.png|sw.js).*)',
  ],
}
