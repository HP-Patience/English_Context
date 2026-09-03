import type { StoryOfflineSnapshot } from './story-offline'

export const STORY_OFFLINE_API_URL = '/api/story/offline' as const
export const STORY_OFFLINE_SHELL_URL = '/story-offline.html' as const
export const STORY_OFFLINE_SNAPSHOT_KEY = '/__story-offline__/snapshot' as const
export const STORY_OFFLINE_READY_KEY = '/__story-offline__/ready' as const
export const STORY_OFFLINE_CACHE_PREFIX = 'story-offline-course-v' as const
export const STORY_OFFLINE_LOCK_NAME = 'context-vocab-story-offline' as const

type StoryOfflineCache = Pick<Cache, 'match' | 'put'>

export type StoryOfflineCacheStorage = {
  readonly open: (name: string) => Promise<StoryOfflineCache>
  readonly keys: () => Promise<string[]>
  readonly delete: (name: string) => Promise<boolean>
}

type StoryOfflineFetcher = (
  request: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export type StoryOfflineLockManager = {
  readonly request: <T>(name: string, callback: () => Promise<T>) => Promise<T>
}

type StoryOfflinePreparationOptions = {
  readonly cacheStorage?: StoryOfflineCacheStorage
  readonly fetcher?: StoryOfflineFetcher
  readonly lockManager?: StoryOfflineLockManager
}

export type StoryOfflineStatus =
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'ready'; readonly courseVersion: number; readonly lessonCount: number }

export class StoryOfflinePreparationError extends Error {
  constructor(readonly stage: 'snapshot' | 'shell' | 'cache', message: string) {
    super(message)
    this.name = 'StoryOfflinePreparationError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isStorySegment(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (value.type === 'text') return typeof value.value === 'string'
  return value.type === 'targetWord'
    && typeof value.word === 'string'
    && typeof value.definitionCn === 'string'
    && typeof value.phonetic === 'string'
    && Number.isInteger(value.wordOrder)
}

function isStoryParagraph(value: unknown): boolean {
  return isRecord(value)
    && typeof value.sceneTitle === 'string'
    && Array.isArray(value.segments)
    && value.segments.every(isStorySegment)
}

function isTargetWord(value: unknown): boolean {
  return isRecord(value)
    && Number.isInteger(value.wordOrder)
    && typeof value.lessonWordId === 'string'
    && typeof value.wordId === 'string'
    && typeof value.meaningId === 'string'
    && typeof value.word === 'string'
    && isNullableString(value.phonetic)
    && typeof value.glossCn === 'string'
    && typeof value.partOfSpeech === 'string'
    && typeof value.definition === 'string'
    && isNullableString(value.definitionCn)
    && isNullableString(value.example)
}

function isStoryOfflineLesson(value: unknown): boolean {
  return isRecord(value)
    && typeof value.id === 'string'
    && Number.isInteger(value.order)
    && typeof value.title === 'string'
    && typeof value.sourceChapterStart === 'string'
    && typeof value.sourceChapterEnd === 'string'
    && Array.isArray(value.paragraphs)
    && value.paragraphs.every(isStoryParagraph)
    && Array.isArray(value.targetWords)
    && value.targetWords.every(isTargetWord)
}

export function isStoryOfflineSnapshot(value: unknown): value is StoryOfflineSnapshot {
  return isRecord(value)
    && value.schemaVersion === 1
    && Number.isInteger(value.courseVersion)
    && typeof value.courseVersion === 'number'
    && value.courseVersion > 0
    && Array.isArray(value.lessons)
    && value.lessons.every(isStoryOfflineLesson)
}

async function readReadyStatus(
  cacheStorage: StoryOfflineCacheStorage,
  cacheName: string,
): Promise<StoryOfflineStatus> {
  const versionText = cacheName.slice(STORY_OFFLINE_CACHE_PREFIX.length)
  const courseVersion = Number(versionText)
  if (!Number.isInteger(courseVersion) || courseVersion < 1) return { kind: 'missing' }

  const cache = await cacheStorage.open(cacheName)
  const [ready, shell, snapshotResponse] = await Promise.all([
    cache.match(STORY_OFFLINE_READY_KEY),
    cache.match(STORY_OFFLINE_SHELL_URL),
    cache.match(STORY_OFFLINE_SNAPSHOT_KEY),
  ])
  if (!ready || !shell || !snapshotResponse) return { kind: 'missing' }

  const snapshot: unknown = await snapshotResponse.json()
  if (!isStoryOfflineSnapshot(snapshot) || snapshot.courseVersion !== courseVersion) {
    return { kind: 'missing' }
  }
  return { kind: 'ready', courseVersion, lessonCount: snapshot.lessons.length }
}

export async function getStoryOfflineStatus(
  cacheStorage: StoryOfflineCacheStorage | undefined = globalThis.caches,
): Promise<StoryOfflineStatus> {
  if (!cacheStorage) return { kind: 'unsupported' }
  const names = (await cacheStorage.keys())
    .filter((name) => name.startsWith(STORY_OFFLINE_CACHE_PREFIX))
    .sort((left, right) => Number(right.slice(STORY_OFFLINE_CACHE_PREFIX.length))
      - Number(left.slice(STORY_OFFLINE_CACHE_PREFIX.length)))

  for (const name of names) {
    const status = await readReadyStatus(cacheStorage, name)
    if (status.kind === 'ready') return status
  }
  return { kind: 'missing' }
}

export async function purgeStoryOfflineCache(
  cacheStorage: StoryOfflineCacheStorage | undefined = globalThis.caches,
): Promise<void> {
  if (!cacheStorage) return
  const names = await cacheStorage.keys()
  await Promise.all(names
    .filter((name) => name.startsWith(STORY_OFFLINE_CACHE_PREFIX))
    .map((name) => cacheStorage.delete(name)))
}

export function withStoryOfflineLock<T>(
  operation: () => Promise<T>,
  lockManager: StoryOfflineLockManager | undefined = globalThis.navigator?.locks,
): Promise<T> {
  if (!lockManager) return operation()
  return lockManager.request(STORY_OFFLINE_LOCK_NAME, operation)
}

export function prepareStoryOffline({
  cacheStorage = globalThis.caches,
  fetcher = globalThis.fetch,
  lockManager = globalThis.navigator?.locks,
}: StoryOfflinePreparationOptions = {}): Promise<StoryOfflineStatus> {
  return withStoryOfflineLock(
    () => prepareStoryOfflineUnlocked(cacheStorage, fetcher),
    lockManager,
  )
}

async function prepareStoryOfflineUnlocked(
  cacheStorage: StoryOfflineCacheStorage | undefined,
  fetcher: StoryOfflineFetcher,
): Promise<StoryOfflineStatus> {
  if (!cacheStorage) {
    throw new StoryOfflinePreparationError('cache', 'Cache Storage is not available')
  }

  const snapshotResponse = await fetcher(STORY_OFFLINE_API_URL, {
    cache: 'no-store',
    credentials: 'same-origin',
  })
  if (!snapshotResponse.ok) {
    throw new StoryOfflinePreparationError('snapshot', `Story snapshot request failed (${snapshotResponse.status})`)
  }
  const snapshot: unknown = await snapshotResponse.clone().json()
  if (!isStoryOfflineSnapshot(snapshot)) {
    throw new StoryOfflinePreparationError('snapshot', 'Story snapshot response is invalid')
  }

  const cacheName = `${STORY_OFFLINE_CACHE_PREFIX}${snapshot.courseVersion}`
  const existingCacheNames = await cacheStorage.keys()
  if (existingCacheNames.includes(cacheName)) {
    const existing = await readReadyStatus(cacheStorage, cacheName)
    if (existing.kind === 'ready') return existing
  }

  const shellResponse = await fetcher(STORY_OFFLINE_SHELL_URL, {
    cache: 'no-store',
    credentials: 'same-origin',
  })
  if (!shellResponse.ok) {
    throw new StoryOfflinePreparationError('shell', `Offline shell request failed (${shellResponse.status})`)
  }

  const cache = await cacheStorage.open(cacheName)
  try {
    await Promise.all([
      cache.put(STORY_OFFLINE_SNAPSHOT_KEY, snapshotResponse.clone()),
      cache.put(STORY_OFFLINE_SHELL_URL, shellResponse.clone()),
    ])
    await cache.put(STORY_OFFLINE_READY_KEY, new Response(String(snapshot.courseVersion)))
  } catch (error) {
    await cacheStorage.delete(cacheName)
    if (error instanceof Error) {
      throw new StoryOfflinePreparationError('cache', error.message)
    }
    throw error
  }

  const cacheNames = await cacheStorage.keys()
  await Promise.all(cacheNames
    .filter((name) => name.startsWith(STORY_OFFLINE_CACHE_PREFIX) && name !== cacheName)
    .map((name) => cacheStorage.delete(name)))

  return { kind: 'ready', courseVersion: snapshot.courseVersion, lessonCount: snapshot.lessons.length }
}
