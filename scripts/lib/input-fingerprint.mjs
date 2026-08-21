import { createHash } from 'node:crypto'

export function fingerprintBytes(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function fingerprintText(value) {
  if (typeof value !== 'string') throw new TypeError('fingerprintText expects a string')
  return fingerprintBytes(Buffer.from(value, 'utf8'))
}

export function fingerprintValue(value) {
  return fingerprintText(stableStringify(value))
}

export function stableStringify(value) {
  return JSON.stringify(canonicalize(value))
}

function canonicalize(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('fingerprints require finite numbers')
    return value
  }
  if (Array.isArray(value)) return value.map((item) => canonicalize(item === undefined ? null : item))
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    const result = {}
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) result[key] = canonicalize(value[key])
    }
    return result
  }
  throw new TypeError(`unsupported fingerprint value type: ${typeof value}`)
}
