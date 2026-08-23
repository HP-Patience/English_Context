const WINDOW_MS = 60_000
const MAX_FAILURES = 30

let failures: number[] = []

function recentFailures(now: number) {
  failures = failures.filter((timestamp) => timestamp > now - WINDOW_MS)
  return failures
}

export function checkLoginRateLimit(now = Date.now()) {
  const count = recentFailures(now).length
  if (count < MAX_FAILURES) return { allowed: true, retryAfterSeconds: 0 }

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((failures[0] + WINDOW_MS - now) / 1000),
  )
  return { allowed: false, retryAfterSeconds }
}

export function recordFailedLogin(now = Date.now()) {
  recentFailures(now).push(now)
}

export function clearLoginFailures() {
  failures = []
}
