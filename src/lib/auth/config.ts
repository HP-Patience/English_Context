export type AuthConfig = {
  secret: string
  secureCookie: boolean
}

export function getAuthConfig(): AuthConfig | null {
  const secret = process.env.APP_AUTH_SECRET?.trim()

  if (!secret || secret.length < 32) return null

  return {
    secret,
    secureCookie: process.env.APP_AUTH_SECURE_COOKIE === 'true',
  }
}
