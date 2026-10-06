import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const apply = process.argv.includes('--apply')
const progressEvery = 100

function normalize(value) {
  return (value ?? '').trim().toLocaleLowerCase()
}

function duplicateKey(meaning) {
  return [meaning.wordId, normalize(meaning.partOfSpeech), normalize(meaning.definition), normalize(meaning.definitionCn)].join('\\u0000')
}

function canonicalRank(meaning) {
  return [meaning.storyLessonWords, meaning.userWordMeanings, meaning.generatedSentences, meaning.id]
}

function compareRank(left, right) {
  const a = canonicalRank(left)
  const b = canonicalRank(right)
  for (let index = 0; index < a.length - 1; index += 1) {
    if (a[index] !== b[index]) return b[index] - a[index]
  }
  return a[3].localeCompare(b[3])
}

function progressRank(row) {
  return [row.mastery, row.interval, row.lastRatedAt ? 1 : 0, row.lastRatedAt?.getTime() ?? 0, row.id]
}

function compareProgress(left, right) {
  const a = progressRank(left)
  const b = progressRank(right)
  for (let index = 0; index < a.length - 1; index += 1) {
    if (a[index] !== b[index]) return b[index] - a[index]
  }
  return a[4].localeCompare(b[4])
}

async function loadDuplicateGroups() {
  const meanings = await prisma.meaning.findMany({
    select: {
      id: true,
      wordId: true,
      partOfSpeech: true,
      definition: true,
      definitionCn: true,
      _count: { select: { storyLessonWords: true, generatedSentences: true, userWordMeanings: true } },
    },
    orderBy: [{ wordId: 'asc' }, { id: 'asc' }],
  })

  const groups = new Map()
  for (const meaning of meanings) {
    const key = duplicateKey(meaning)
    const group = groups.get(key) ?? []
    group.push({
      id: meaning.id,
      wordId: meaning.wordId,
      partOfSpeech: meaning.partOfSpeech,
      definition: meaning.definition,
      definitionCn: meaning.definitionCn,
      storyLessonWords: meaning._count.storyLessonWords,
      generatedSentences: meaning._count.generatedSentences,
      userWordMeanings: meaning._count.userWordMeanings,
    })
    groups.set(key, group)
  }

  return [...groups.values()].filter((group) => group.length > 1)
}

async function mergeGroup(summaryGroup) {
  const ids = summaryGroup.map((meaning) => meaning.id)
  const canonicalSummary = [...summaryGroup].sort(compareRank)[0]
  const duplicateIds = ids.filter((id) => id !== canonicalSummary.id)

  return prisma.$transaction(async (tx) => {
    const meanings = await tx.meaning.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        wordId: true,
        userWordMeanings: {
          select: {
            id: true,
            userWordId: true,
            meaningId: true,
            easeFactor: true,
            interval: true,
            nextReviewAt: true,
            currentTestLevel: true,
            mastery: true,
            lastRatedAt: true,
          },
        },
      },
    })

    const storyLinks = await tx.storyLessonWord.findMany({
      where: { meaningId: { in: ids } },
      select: { id: true, lessonId: true, wordId: true, meaningId: true },
    })
    const storyLinkKeys = new Set()
    for (const link of storyLinks) {
      const key = `${link.lessonId}\\u0000${link.wordId}`
      if (storyLinkKeys.has(key)) {
        throw new Error(`Cannot safely merge ${canonicalSummary.id}: duplicate story lesson link ${key}`)
      }
      storyLinkKeys.add(key)
    }

    let deletedProgress = 0
    let movedSentences = 0
    let movedLogs = 0
    const progressByUserWord = new Map()
    for (const meaning of meanings) {
      for (const progress of meaning.userWordMeanings) {
        const rows = progressByUserWord.get(progress.userWordId) ?? []
        rows.push(progress)
        progressByUserWord.set(progress.userWordId, rows)
      }
    }

    for (const rows of progressByUserWord.values()) {
      const [winner, ...losers] = [...rows].sort(compareProgress)
      await tx.userWordMeaning.update({ where: { id: winner.id }, data: { meaningId: canonicalSummary.id } })
      for (const loser of losers) {
        const sentences = await tx.generatedSentence.updateMany({
          where: { userWordMeaningId: loser.id },
          data: { userWordMeaningId: winner.id, meaningId: canonicalSummary.id },
        })
        const logs = await tx.reviewLog.updateMany({
          where: { userWordMeaningId: loser.id },
          data: { userWordMeaningId: winner.id },
        })
        movedSentences += sentences.count
        movedLogs += logs.count
        await tx.userWordMeaning.delete({ where: { id: loser.id } })
        deletedProgress += 1
      }
    }

    await tx.generatedSentence.updateMany({
      where: { meaningId: { in: duplicateIds } },
      data: { meaningId: canonicalSummary.id },
    })
    await tx.storyLessonWord.updateMany({
      where: { meaningId: { in: duplicateIds } },
      data: { meaningId: canonicalSummary.id },
    })
    const deletedMeanings = await tx.meaning.deleteMany({ where: { id: { in: duplicateIds } } })
    return { deletedMeanings: deletedMeanings.count, deletedProgress, movedSentences, movedLogs }
  })
}


async function recalculateUserWordMastery() {
  const rows = await prisma.userWord.findMany({
    select: { id: true, mastery: true, meanings: { select: { mastery: true } } },
  })
  let changed = 0
  for (const row of rows) {
    const mastery = row.meanings.length
      ? Math.round(row.meanings.reduce((total, meaning) => total + meaning.mastery, 0) / row.meanings.length)
      : 0
    if (mastery !== row.mastery) {
      await prisma.userWord.update({ where: { id: row.id }, data: { mastery } })
      changed += 1
    }
  }
  return { scanned: rows.length, changed }
}

async function removeDuplicateGeneratedSentences() {
  const rows = await prisma.generatedSentence.findMany({
    select: {
      id: true,
      userWordMeaningId: true,
      sentenceText: true,
      sentenceCn: true,
      contextTopic: true,
      interestTuned: true,
      source: true,
      createdAt: true,
      lastUsedAt: true,
    },
  })
  const groups = new Map()
  for (const row of rows) {
    const key = [row.userWordMeaningId, row.sentenceText, row.sentenceCn ?? '', row.contextTopic ?? '', row.interestTuned, row.source].join('\u0000')
    const group = groups.get(key) ?? []
    group.push(row)
    groups.set(key, group)
  }

  let deleted = 0
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const [, ...duplicates] = [...group].sort((left, right) => (
      right.lastUsedAt.getTime() - left.lastUsedAt.getTime()
      || right.createdAt.getTime() - left.createdAt.getTime()
      || right.id.localeCompare(left.id)
    ))
    const result = await prisma.generatedSentence.deleteMany({ where: { id: { in: duplicates.map((row) => row.id) } } })
    deleted += result.count
  }
  return { scanned: rows.length, deleted }
}

async function main() {
  const groups = await loadDuplicateGroups()
  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    duplicateGroups: groups.length,
    duplicateMeanings: groups.reduce((total, group) => total + group.length, 0),
    groupsWithStoryReferences: groups.filter((group) => group.some((meaning) => meaning.storyLessonWords > 0)).length,
    groupsWithLearningProgress: groups.filter((group) => group.some((meaning) => meaning.userWordMeanings > 0)).length,
  }
  console.log(JSON.stringify(summary))

  if (!apply) return

  let deletedMeanings = 0
  let deletedProgress = 0
  let movedSentences = 0
  let movedLogs = 0
  for (const [index, group] of groups.entries()) {
    const result = await mergeGroup(group)
    deletedMeanings += result.deletedMeanings
    deletedProgress += result.deletedProgress
    movedSentences += result.movedSentences
    movedLogs += result.movedLogs
    if ((index + 1) % progressEvery === 0 || index + 1 === groups.length) {
      console.log(JSON.stringify({ progress: `${index + 1}/${groups.length}`, deletedMeanings, deletedProgress, movedSentences, movedLogs }))
    }
  }

  const mastery = await recalculateUserWordMastery()
  const sentenceCleanup = await removeDuplicateGeneratedSentences()
  console.log(JSON.stringify({ mastery, sentenceCleanup }))
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())

