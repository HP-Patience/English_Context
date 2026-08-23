export type StoryGenerationStatus = 'idle' | 'running' | 'completed' | 'failed' | 'unknown'

export type StoryGenerationProgress = {
  available: boolean
  status: StoryGenerationStatus
  statusText: string
  currentLesson: number | null
  completedLessons: number
  totalLessons: number | null
  percent: number | null
  elapsedMs: number | null
  etaMs: number | null
  startedAt: string | null
  updatedAt: string | null
  lastCompletedLesson: number | null
  courseId: string | null
  courseVersion: string | number | null
  source: 'snapshot' | 'report' | 'missing'
  snapshotPath: string | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function numberFrom(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function integerFrom(value: unknown): number | null {
  const number = numberFrom(value)
  return number === null ? null : Math.max(0, Math.trunc(number))
}

function stringFrom(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value
  return null
}

function statusFrom(value: unknown): StoryGenerationStatus {
  const raw = typeof value === 'string' ? value.toLowerCase() : ''
  if (['idle', 'running', 'completed', 'failed', 'unknown'].includes(raw)) {
    return raw as StoryGenerationStatus
  }
  if (['complete', 'done', 'success', 'succeeded', 'published'].includes(raw)) return 'completed'
  if (['error', 'errored', 'failure'].includes(raw)) return 'failed'
  if (['starting', 'preparing', 'initializing', 'processing', 'generating', 'in_progress', 'in-progress', 'active'].includes(raw)) return 'running'
  return 'unknown'
}

function firstNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = numberFrom(record[key])
    if (value !== null) return value
  }
  return null
}

function firstInteger(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = integerFrom(record[key])
    if (value !== null) return value
  }
  return null
}

function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = stringFrom(record[key])
    if (value !== null) return value
  }
  return null
}

function timestampMs(value: string | null): number | null {
  if (!value) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

function clampPercent(value: number | null): number | null {
  if (value === null) return null
  return Math.min(100, Math.max(0, Math.round(value)))
}

function deriveStatusText(progress: Pick<StoryGenerationProgress, 'available' | 'status' | 'completedLessons' | 'totalLessons'>) {
  if (!progress.available) return '尚未发现故事生成进度快照。'
  if (progress.status === 'completed') return '故事课程生成已完成。'
  if (progress.status === 'failed') return '故事课程生成失败，请查看生成日志。'
  if (progress.status === 'running') return '故事课程正在生成中。'
  if (progress.status === 'idle') return '故事课程生成尚未开始。'
  const totalText = progress.totalLessons ? ` / ${progress.totalLessons}` : ''
  return `已生成 ${progress.completedLessons}${totalText} 篇。`
}

export function normalizeStoryGenerationProgress(
  rawValue: unknown,
  options: { source?: StoryGenerationProgress['source']; snapshotPath?: string | null; fileUpdatedAt?: string | null } = {},
): StoryGenerationProgress {
  const raw = asRecord(rawValue)
  if (!raw) return emptyStoryGenerationProgress(options.fileUpdatedAt ?? null)

  const nested = asRecord(raw.progress) ?? raw
  const totalLessons = firstInteger(nested, ['totalLessons', 'lessonCount', 'total', 'totalLessonCount'])
  const explicitCompletedLessons = firstInteger(nested, [
    'completedLessons',
    'generatedLessonCount',
    'completedLessonCount',
    'finishedLessons',
    'readyLessonCount',
  ])
  const rawStatus = statusFrom(nested.status)
  const isCompleteReport = nested.published === true || nested.ok === true || rawStatus === 'completed'
  const completedLessons = explicitCompletedLessons ?? (isCompleteReport && totalLessons !== null ? totalLessons : 0)
  const currentLesson = firstInteger(nested, [
    'currentLesson',
    'currentLessonOrder',
    'lessonOrder',
    'current',
  ])
  const lastCompletedLesson = firstInteger(nested, [
    'lastCompletedLesson',
    'lastCompletedLessonOrder',
    'lastLessonOrder',
  ]) ?? (completedLessons > 0 ? completedLessons : null)

  const startedAt = firstString(nested, ['startedAt', 'started_at', 'startTime'])
  const updatedAt = firstString(nested, ['updatedAt', 'updated_at', 'generatedAt', 'timestamp']) ?? options.fileUpdatedAt ?? null
  const explicitElapsedMs = firstNumber(nested, ['elapsedMs', 'elapsedMilliseconds'])
  const elapsedSeconds = firstNumber(nested, ['elapsedSeconds', 'elapsedSec'])
  const elapsedMs = explicitElapsedMs ?? (elapsedSeconds === null ? null : elapsedSeconds * 1000) ?? (() => {
    const startMs = timestampMs(startedAt)
    const updateMs = timestampMs(updatedAt)
    return startMs !== null && updateMs !== null && updateMs >= startMs ? updateMs - startMs : null
  })()

  const explicitEtaMs = firstNumber(nested, ['etaMs', 'etaMilliseconds', 'remainingMs'])
  const etaSeconds = firstNumber(nested, ['etaSeconds', 'remainingSeconds'])
  const etaMs = explicitEtaMs ?? (etaSeconds === null ? null : etaSeconds * 1000)

  const rawPercent = firstNumber(nested, ['percent', 'percentage', 'progressPercent'])
  const percent = clampPercent(
    rawPercent ?? (totalLessons && totalLessons > 0 ? (completedLessons / totalLessons) * 100 : null),
  )

  const inferredStatus = totalLessons !== null && totalLessons > 0 && completedLessons >= totalLessons ? 'completed' : 'unknown'
  const status = rawStatus === 'unknown' ? inferredStatus : rawStatus
  const statusText = firstString(nested, ['statusText', 'message', 'currentStep', 'step'])

  const progress: StoryGenerationProgress = {
    available: true,
    status,
    statusText: statusText ?? deriveStatusText({ available: true, status, completedLessons, totalLessons }),
    currentLesson,
    completedLessons,
    totalLessons,
    percent,
    elapsedMs: elapsedMs === null ? null : Math.max(0, Math.round(elapsedMs)),
    etaMs: etaMs === null ? null : Math.max(0, Math.round(etaMs)),
    startedAt,
    updatedAt,
    lastCompletedLesson,
    courseId: firstString(nested, ['courseId', 'publishedCourseId']),
    courseVersion: firstString(nested, ['courseVersion', 'publishedCourseVersion']) ?? firstNumber(nested, ['courseVersion', 'publishedCourseVersion']),
    source: options.source ?? 'snapshot',
    snapshotPath: options.snapshotPath ?? null,
  }

  return progress
}

export function emptyStoryGenerationProgress(updatedAt: string | null = null): StoryGenerationProgress {
  return {
    available: false,
    status: 'idle',
    statusText: deriveStatusText({ available: false, status: 'idle', completedLessons: 0, totalLessons: null }),
    currentLesson: null,
    completedLessons: 0,
    totalLessons: null,
    percent: null,
    elapsedMs: null,
    etaMs: null,
    startedAt: null,
    updatedAt,
    lastCompletedLesson: null,
    courseId: null,
    courseVersion: null,
    source: 'missing',
    snapshotPath: null,
  }
}
