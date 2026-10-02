import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const model = () => ({ deleteMany: vi.fn() })
  const tx = {
    generatedSentence: model(), reviewLog: model(), userWordMeaning: model(), userWord: model(),
    reviewSession: model(), userStoryParagraphCompletion: model(), userStoryStepCompletion: model(),
    userStoryLessonCompletion: model(), userStoryParagraphBookmark: model(), userStoryWordProgress: model(),
    storyReviewAttempt: model(), userStoryProgress: model(), dailyGoal: model(), learningMessage: model(),
    learningQuizWord: model(), learningQuiz: model(), learningChallengeParticipant: model(), learningChallenge: model(),
    user: { delete: vi.fn() },
  }
  return { tx, userFindUnique: vi.fn(), transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)) }
})

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    $transaction: mocks.transaction,
  },
}))

import { deleteManagedUser } from './users'

describe('managed user deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.userFindUnique.mockResolvedValue({ id: 'friend-1', role: 'user' })
  })

  it('deletes user-owned rows in a transaction without touching public content', async () => {
    await deleteManagedUser('admin-1', 'friend-1')
    expect(mocks.transaction).toHaveBeenCalledOnce()
    expect(mocks.tx.learningMessage.deleteMany).toHaveBeenCalledOnce()
    expect(mocks.tx.learningQuiz.deleteMany).toHaveBeenCalledOnce()
    expect(mocks.tx.user.delete).toHaveBeenCalledWith({ where: { id: 'friend-1' } })
  })

  it('does not allow the administrator to delete itself', async () => {
    await expect(deleteManagedUser('admin-1', 'admin-1')).rejects.toThrow()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})
