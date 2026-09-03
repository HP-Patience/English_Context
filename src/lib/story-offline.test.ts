import { describe, expect, it } from 'vitest'

import { getReadyStoryOfflineSnapshot } from './story-offline'

const contentJson = JSON.stringify({
  title: 'Ready lesson',
  order: 1,
  sourceChapterStart: '第一章',
  sourceChapterEnd: '第二章',
  sourceSummary: 'private generation summary',
  continuityNotes: 'private continuity notes',
  paragraphs: [{
    sceneTitle: '山寨晨雾',
    segments: [
      { type: 'text', value: '方源看着 ' },
      { type: 'targetWord', word: 'alpha', definitionCn: '阿尔法', phonetic: '/ˈælfə/', wordOrder: 1 },
    ],
  }],
})

describe('getReadyStoryOfflineSnapshot', () => {
  it('returns every ready lesson as a user-independent public snapshot', async () => {
    const calls: unknown[] = []
    const prisma = {
      storyCourse: {
        findUnique: async (args: unknown) => {
          calls.push(args)
          return {
            id: 'course-ready',
            version: 7,
            status: 'ready',
            readySlot: 'ready',
            sourceFingerprint: 'private-source-fingerprint',
            lessons: [{
              id: 'lesson-ready-1',
              order: 1,
              title: 'Ready lesson',
              sourceChapterStart: '第一章',
              sourceChapterEnd: '第二章',
              sourceSummary: 'private lesson summary',
              continuityNotes: 'private lesson continuity',
              generationError: 'private generation error',
              contentJson,
              words: [{
                id: 'lesson-word-alpha',
                sortOrder: 1,
                glossCn: '阿尔法',
                word: { id: 'word-alpha', text: 'alpha', phonetic: '/ˈælfə/' },
                meaning: {
                  id: 'meaning-alpha',
                  partOfSpeech: 'n.',
                  definition: 'the first letter',
                  definitionCn: '阿尔法',
                  example: 'alpha example',
                },
                userProgress: [{ userId: 'private-user' }],
                reviewAttempts: [{ result: 'remembered' }],
              }],
              userProgress: [{ userId: 'private-user', bookmarked: true }],
            }],
          }
        },
      },
    }

    const snapshot = await getReadyStoryOfflineSnapshot({ prisma })

    expect(snapshot).toEqual({
      schemaVersion: 1,
      courseVersion: 7,
      lessons: [{
        id: 'lesson-ready-1',
        order: 1,
        title: 'Ready lesson',
        sourceChapterStart: '第一章',
        sourceChapterEnd: '第二章',
        paragraphs: [{
          sceneTitle: '山寨晨雾',
          segments: [
            { type: 'text', value: '方源看着 ' },
            { type: 'targetWord', word: 'alpha', definitionCn: '阿尔法', phonetic: '/ˈælfə/', wordOrder: 1 },
          ],
        }],
        targetWords: [{
          wordOrder: 1,
          lessonWordId: 'lesson-word-alpha',
          wordId: 'word-alpha',
          meaningId: 'meaning-alpha',
          word: 'alpha',
          phonetic: '/ˈælfə/',
          glossCn: '阿尔法',
          partOfSpeech: 'n.',
          definition: 'the first letter',
          definitionCn: '阿尔法',
          example: 'alpha example',
        }],
      }],
    })
    expect(JSON.stringify(snapshot)).not.toMatch(/private|progress|bookmark|review/i)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      where: { readySlot: 'ready' },
      select: {
        version: true,
        status: true,
        readySlot: true,
        lessons: {
          where: { status: 'ready' },
          orderBy: { order: 'asc' },
        },
      },
    })
  })

  it('returns null when no course occupies the ready slot', async () => {
    const snapshot = await getReadyStoryOfflineSnapshot({
      prisma: { storyCourse: { findUnique: async () => null } },
    })

    expect(snapshot).toBeNull()
  })
})
