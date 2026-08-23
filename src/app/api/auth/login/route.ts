import { NextResponse, type NextRequest } from 'next/server'

import { getAuthConfig } from '@/lib/auth/config'
import { verifyPassword } from '@/lib/auth/password'
import {
  checkLoginRateLimit,
  clearLoginFailures,
  recordFailedLogin,
} from '@/lib/auth/rate-limit'
import {
  AUTH_SESSION_COOKIE,
  AUTH_SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  sessionCookieOptions,
} from '@/lib/auth/session'

export const runtime = 'nodejs'

function invalidCredentials() {
  return NextResponse.json(
    { error: '用户名或密码错误' },
    { status: 401 },
  )
}

export async function POST(request: NextRequest) {
  const authConfig = getAuthConfig()
  if (!authConfig) {
    return NextResponse.json(
      { error: '服务器尚未配置登录信息' },
      { status: 503 },
    )
  }

  const rateLimit = checkLoginRateLimit()
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: '尝试次数过多，请稍后再试' },
      {
        status: 429,
        headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
      },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }

  const { username, password } = body as Record<string, unknown>
  if (
    typeof username !== 'string'
    || typeof password !== 'string'
    || username.length > 128
    || password.length > 1_024
  ) {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }

  const passwordMatches = await verifyPassword(password, authConfig.passwordHash)
  if (username !== authConfig.username || !passwordMatches) {
    recordFailedLogin()
    await new Promise((resolve) => setTimeout(resolve, 500))
    return invalidCredentials()
  }

  clearLoginFailures()
  const token = await createSessionToken(
    authConfig.username,
    authConfig.secret,
  )
  const response = NextResponse.json({ ok: true })
  response.headers.set('Cache-Control', 'no-store')
  response.cookies.set(AUTH_SESSION_COOKIE, token, {
    ...sessionCookieOptions(authConfig.secureCookie),
    maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
  })
  return response
}
