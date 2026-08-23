export type AuthConfig = {
  username: string
  passwordHash: string
  secret: string
  secureCookie: boolean
}

export function getAuthConfig(): AuthConfig | null {
  const username = process.env.APP_AUTH_USERNAME?.trim()
  const passwordHash = process.env.APP_AUTH_PASSWORD_HASH?.trim()
  const secret = process.env.APP_AUTH_SECRET?.trim()

  if (!username || !passwordHash || !secret || secret.length < 32) {
    return null
  }

  return {
    username,
    passwordHash,
    secret,
    secureCookie: process.env.APP_AUTH_SECURE_COOKIE === 'true',
  }
}
