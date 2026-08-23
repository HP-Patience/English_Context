import { SignJWT, jwtVerify } from 'jose'

export const AUTH_SESSION_COOKIE = 'contextvocab_session'
export const AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

function secretKey(secret: string) {
  return new TextEncoder().encode(secret)
}

export async function createSessionToken(
  username: string,
  secret: string,
  now = new Date(),
) {
  const issuedAt = Math.floor(now.getTime() / 1000)

  return new SignJWT({ sub: username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + AUTH_SESSION_MAX_AGE_SECONDS)
    .sign(secretKey(secret))
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string,
  expectedUsername: string,
  now = new Date(),
) {
  if (!token) return false

  try {
    const { payload } = await jwtVerify(token, secretKey(secret), {
      algorithms: ['HS256'],
      currentDate: now,
    })
    return payload.sub === expectedUsername
  } catch {
    return false
  }
}

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
  }
}
