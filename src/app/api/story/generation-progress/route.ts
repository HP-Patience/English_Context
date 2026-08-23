import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

import { NextResponse } from 'next/server'

import {
  emptyStoryGenerationProgress,
  normalizeStoryGenerationProgress,
  type StoryGenerationProgress,
} from '@/lib/story-generation-progress'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const CACHE_DIR = path.join(process.cwd(), 'scripts', '.story-cache')

const SNAPSHOT_CANDIDATES = [
  'story-generation-progress.json',
  'generation-progress.json',
  'story-progress.json',
  'progress.json',
]

const REPORT_CANDIDATES = [
  'story-generation-report.json',
  'story-validation-report.json',
]

async function readProgressFile(
  fileName: string,
  source: StoryGenerationProgress['source'],
): Promise<StoryGenerationProgress | null> {
  const absolutePath = path.join(CACHE_DIR, fileName)
  try {
    const [content, fileStat] = await Promise.all([
      readFile(absolutePath, 'utf8'),
      stat(absolutePath),
    ])
    const parsed = JSON.parse(content) as unknown
    return normalizeStoryGenerationProgress(parsed, {
      source,
      snapshotPath: path.relative(process.cwd(), absolutePath),
      fileUpdatedAt: fileStat.mtime.toISOString(),
    })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null
    if (error instanceof SyntaxError) {
      return {
        ...emptyStoryGenerationProgress(),
        available: true,
        status: 'failed',
        statusText: `进度快照 ${fileName} 不是有效 JSON。`,
        source,
        snapshotPath: path.relative(process.cwd(), absolutePath),
      }
    }
    throw error
  }
}

export async function GET() {
  try {
    for (const candidate of SNAPSHOT_CANDIDATES) {
      const progress = await readProgressFile(candidate, 'snapshot')
      if (progress) return NextResponse.json({ progress })
    }

    for (const candidate of REPORT_CANDIDATES) {
      const progress = await readProgressFile(candidate, 'report')
      if (progress) return NextResponse.json({ progress })
    }

    return NextResponse.json({ progress: emptyStoryGenerationProgress() })
  } catch (error) {
    console.error('Failed to read story generation progress', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
