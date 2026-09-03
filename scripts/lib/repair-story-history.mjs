const completionModels = [
  ['userStoryParagraphCompletion', 'paragraphCompletions'],
  ['userStoryStepCompletion', 'stepCompletions'],
  ['userStoryLessonCompletion', 'lessonCompletions'],
]

export function buildHistoricalLessonMappings(courses, clonedLessons) {
  const targetByOrder = new Map(clonedLessons.map((lesson) => [lesson.order, lesson]))
  const mappings = []
  const mappedLessonIds = new Set()

  for (const course of courses) {
    if (course.status !== 'archived' && course.status !== 'ready') continue
    for (const lesson of course.lessons) {
      const target = targetByOrder.get(lesson.order)
      if (!target || mappedLessonIds.has(lesson.id)) continue
      const content = JSON.parse(lesson.contentJson)
      if (!Array.isArray(content.paragraphs) || content.paragraphs.length !== target.paragraphCount) {
        throw new Error(`Story lesson ${lesson.id} has an incompatible paragraph count for cloned lesson ${target.newLessonId}`)
      }
      mappings.push({
        oldLessonId: lesson.id,
        newLessonId: target.newLessonId,
        paragraphCount: target.paragraphCount,
      })
      mappedLessonIds.add(lesson.id)
    }
  }

  return mappings
}

export async function migrateClonedLessonHistory(tx, lessonMappings) {
  const targetByOldLessonId = new Map(lessonMappings.map((mapping) => [mapping.oldLessonId, mapping]))
  const oldLessonIds = [...targetByOldLessonId.keys()]
  const rowsByModel = new Map()

  for (const [model] of completionModels) {
    rowsByModel.set(model, await tx[model].findMany({ where: { lessonId: { in: oldLessonIds } } }))
  }
  const paragraphBookmarks = await tx.userStoryParagraphBookmark.findMany({
    where: { lessonId: { in: oldLessonIds } },
  })

  for (const row of rowsByModel.get('userStoryParagraphCompletion')) {
    requireParagraph(targetByOldLessonId, row)
  }
  for (const row of paragraphBookmarks) requireParagraph(targetByOldLessonId, row)

  const counts = {}
  for (const [model, countName] of completionModels) {
    const rows = rowsByModel.get(model)
    for (const row of rows) {
      const target = requireTarget(targetByOldLessonId, row.lessonId)
      await tx[model].update({ where: { id: row.id }, data: { lessonId: target.newLessonId } })
    }
    counts[countName] = rows.length
  }
  let mergedBookmarks = 0
  for (const row of paragraphBookmarks) {
    const target = requireTarget(targetByOldLessonId, row.lessonId)
    const conflict = await tx.userStoryParagraphBookmark.findUnique({
      where: {
        userId_lessonId_paragraphIndex: {
          userId: row.userId,
          lessonId: target.newLessonId,
          paragraphIndex: row.paragraphIndex,
        },
      },
    })
    if (conflict && conflict.id !== row.id) {
      const sourceWins = earlierBookmark(row, conflict)
      await tx.userStoryParagraphBookmark.delete({ where: { id: sourceWins ? conflict.id : row.id } })
      mergedBookmarks += 1
      if (!sourceWins) continue
    }
    await tx.userStoryParagraphBookmark.update({ where: { id: row.id }, data: { lessonId: target.newLessonId } })
  }
  counts.paragraphBookmarks = paragraphBookmarks.length
  counts.paragraphBookmarksMerged = mergedBookmarks
  return counts
}

function earlierBookmark(left, right) {
  const dateComparison = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  return dateComparison < 0 || (dateComparison === 0 && left.id.localeCompare(right.id) < 0)
}

function requireTarget(targetByOldLessonId, oldLessonId) {
  const target = targetByOldLessonId.get(oldLessonId)
  if (!target) throw new Error(`No cloned lesson for ${oldLessonId}`)
  return target
}

function requireParagraph(targetByOldLessonId, row) {
  const target = requireTarget(targetByOldLessonId, row.lessonId)
  if (!Number.isInteger(row.paragraphIndex) || row.paragraphIndex < 0 || row.paragraphIndex >= target.paragraphCount) {
    throw new Error(`Story paragraph ${row.paragraphIndex} does not exist in cloned lesson ${target.newLessonId}`)
  }
  return target
}
