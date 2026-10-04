import { NextResponse } from 'next/server'

import { getAuthConfig } from '@/lib/auth/config'
import {
  AUTH_SESSION_COOKIE,
  sessionCookieOptions,
} from '@/lib/auth/session'

export async function POST() {
  const authConfig = getAuthConfig()
  const response = NextResponse.json({ ok: true })
  response.headers.set('Cache-Control', 'no-store')
  response.cookies.set(AUTH_SESSION_COOKIE, '', {
    ...sessionCookieOptions(authConfig?.secureCookie ?? false),
    expires: new Date(0),
    maxAge: 0,
  })
  return response
}
