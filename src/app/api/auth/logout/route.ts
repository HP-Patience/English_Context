import { NextResponse, type NextRequest } from 'next/server'

import { getAuthConfig } from '@/lib/auth/config'
import {
  AUTH_SESSION_COOKIE,
  sessionCookieOptions,
} from '@/lib/auth/session'

export async function POST(request: NextRequest) {
  const authConfig = getAuthConfig()
  const response = NextResponse.redirect(new URL('/login', request.url), 303)
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Clear-Site-Data', '"cache"')
  response.cookies.set(AUTH_SESSION_COOKIE, '', {
    ...sessionCookieOptions(authConfig?.secureCookie ?? false),
    expires: new Date(0),
    maxAge: 0,
  })
  return response
}
