import { NextResponse } from 'next/server'

import { prisma, getLocalUserId } from '@/lib/prisma'
import { getReadyStoryOfflineSnapshot } from '@/lib/story-offline'

const SNAPSHOT_CACHE_CONTROL = 'private, no-store'

export async function GET() {
  try {
    await getLocalUserId()
    const snapshot = await getReadyStoryOfflineSnapshot({ prisma })
    if (!snapshot) {
      return NextResponse.json({ error: 'Ready story course not found' }, { status: 404 })
    }

    return NextResponse.json(snapshot, {
      headers: {
        'Cache-Control': SNAPSHOT_CACHE_CONTROL,
        ETag: `"story-course-${snapshot.courseVersion}"`,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    console.error('Failed to build story offline snapshot', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
