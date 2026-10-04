/** @vitest-environment node */
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const prisma = {
    wordGroupItem: { findFirst: vi.fn(), findMany: vi.fn() },
    generatedSentence: { findFirst: vi.fn() },
    meaning: { findUnique: vi.fn() },
    userWord: { upsert: vi.fn(), update: vi.fn() },
    userWordMeaning: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    reviewSession: { create: vi.fn() }, reviewLog: { create: vi.fn() },
    user: { findUnique: vi.fn() }, dailyGoal: { upsert: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  }
  return { prisma, getLocalUserId: vi.fn() }
})
vi.mock('@/lib/prisma', () => mocks)
import { GET, POST } from './route'

const pending = { id: 'pending-1', mastery: 0, interval: 0, easeFactor: 2.5 }
function candidate(existing = true) {
  return {
    wordGroupId: 'group-1',
    word: { id: 'word-1', text: 'agent', userWords: [], meanings: [{
      id: 'meaning-1', partOfSpeech: 'noun', definitionCn: '代理人', definition: 'a representative',
      example: 'The agent arrived.', userWordMeanings: existing ? [pending] : [],
    }] },
  }
}
const postRequest = (body: unknown) => new NextRequest('http://localhost/api/kaoyan/learn', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
beforeEach(() => {
  vi.resetAllMocks()
  mocks.getLocalUserId.mockResolvedValue('reader-1')
  mocks.prisma.generatedSentence.findFirst.mockResolvedValue(null)
})

describe('account-scoped next unlearned word', () => {
  it('selects the next pending meaning in course order without requiring a group or changing progress', async () => {
    mocks.prisma.wordGroupItem.findFirst.mockResolvedValue(candidate())
    const response = await GET(new NextRequest('http://localhost/api/kaoyan/learn'))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: 'pending-1', meaningId: 'meaning-1', word: 'agent', wordId: 'word-1', groupId: 'group-1' })
    expect(mocks.prisma.wordGroupItem.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ wordGroup: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { id: 'asc' }],
      where: { word: { meanings: { some: { OR: [
        { userWordMeanings: { none: { userWord: { userId: 'reader-1' } } } },
        { userWordMeanings: { some: { userWord: { userId: 'reader-1' }, mastery: 0, interval: 0 } } },
      ] } } } },
    }))
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })
  it('offers words to a new account without writing learning records on page entry', async () => {
    mocks.prisma.wordGroupItem.findFirst.mockResolvedValue(candidate(false))
    const response = await GET(new NextRequest('http://localhost/api/kaoyan/learn'))
    expect(await response.json()).toMatchObject({ id: null, meaningId: 'meaning-1', sentence: 'The agent arrived.' })
    expect(mocks.prisma.userWord.upsert).not.toHaveBeenCalled()
    expect(mocks.prisma.userWordMeaning.create).not.toHaveBeenCalled()
  })
  it('returns an explicit completed state when there are no pending words', async () => {
    mocks.prisma.wordGroupItem.findFirst.mockResolvedValue(null)
    expect(await (await GET(new NextRequest('http://localhost/api/kaoyan/learn'))).json()).toEqual({ done: true })
  })
  it('scopes pending and uninitialized meanings to the explicitly selected group', async () => {
    mocks.prisma.wordGroupItem.findFirst.mockResolvedValue({ ...candidate(false), wordGroupId: 'group-2' })
    const response = await GET(new NextRequest('http://localhost/api/kaoyan/learn?groupId=group-2'))
    expect(await response.json()).toMatchObject({ id: null, meaningId: 'meaning-1', groupId: 'group-2' })
    expect(mocks.prisma.wordGroupItem.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ wordGroupId: 'group-2' }) }))
    expect(mocks.prisma.userWord.upsert).not.toHaveBeenCalled()
  })
  it('keeps the existing group-specific endpoint compatible', async () => {
    mocks.prisma.wordGroupItem.findMany.mockResolvedValue([])
    const response = await GET(new NextRequest('http://localhost/api/kaoyan/learn?groupId=group-1'))
    expect(await response.json()).toMatchObject({ done: true, groupId: 'group-1' })
  })
  it('creates only the current account records when rating a previously unseen meaning', async () => {
    mocks.prisma.meaning.findUnique.mockResolvedValue({ id: 'meaning-1', wordId: 'word-1' })
    mocks.prisma.$transaction.mockImplementation(async callback => callback(mocks.prisma))
    mocks.prisma.userWord.upsert.mockResolvedValue({ id: 'owned-word' })
    mocks.prisma.userWordMeaning.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...pending, userWordId: 'owned-word', userWord: { id: 'owned-word' } })
    mocks.prisma.userWordMeaning.create.mockResolvedValue(pending)
    mocks.prisma.userWordMeaning.findMany.mockResolvedValue([{ mastery: 63 }])
    mocks.prisma.reviewSession.create.mockResolvedValue({ id: 'session-1' })
    mocks.prisma.user.findUnique.mockResolvedValue({ dailyTarget: 30 })
    mocks.prisma.dailyGoal.upsert.mockResolvedValue({ id: 'goal-1', learned: 1, target: 30, completed: false })
    const response = await POST(postRequest({ meaningId: 'meaning-1', grade: 4 }))
    expect(response.status).toBe(200)
    expect(mocks.prisma.userWord.upsert).toHaveBeenCalledWith({ where: { userId_wordId: { userId: 'reader-1', wordId: 'word-1' } }, create: { userId: 'reader-1', wordId: 'word-1' }, update: { wordId: 'word-1' } })
    expect(mocks.prisma.userWordMeaning.create).toHaveBeenCalledWith({ data: { userWordId: 'owned-word', meaningId: 'meaning-1' } })
    expect(mocks.prisma.reviewSession.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'reader-1' }) }))
  })
  it('rejects another account meaning and an invalid grade without mutating progress', async () => {
    mocks.prisma.userWordMeaning.findFirst.mockResolvedValue(null)
    expect((await POST(postRequest({ userWordMeaningId: 'someone-elses-meaning', grade: 4 }))).status).toBe(404)
    expect(mocks.prisma.userWordMeaning.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'someone-elses-meaning', userWord: { userId: 'reader-1' } } }))
    expect((await POST(postRequest({ meaningId: 'meaning-1', grade: 'bad' }))).status).toBe(400)
    expect(mocks.prisma.userWordMeaning.update).not.toHaveBeenCalled()
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled()
  })
})
