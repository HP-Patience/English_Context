function matchesWhere(row, where = {}) {
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'id' && expected && typeof expected === 'object' && Object.hasOwn(expected, 'not')) return row.id !== expected.not
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) return matchesWhere(row[key] ?? {}, expected)
    return row[key] === expected
  })
}

function sortRows(rows, orderBy) {
  if (!orderBy) return rows
  const [[field, direction]] = Object.entries(orderBy)
  return rows.sort((left, right) => {
    const comparison = left[field] < right[field] ? -1 : left[field] > right[field] ? 1 : 0
    return direction === 'desc' ? -comparison : comparison
  })
}

function snapshotState(state) {
  return {
    courses: structuredClone(state.courses),
    lessons: structuredClone(state.lessons),
    lessonWords: structuredClone(state.lessonWords),
    words: structuredClone(state.words),
    userStoryProgress: structuredClone(state.userStoryProgress),
    userStoryWordProgress: structuredClone(state.userStoryWordProgress),
    storyReviewAttempts: structuredClone(state.storyReviewAttempts),
    userWords: structuredClone(state.userWords),
    userWordMeanings: structuredClone(state.userWordMeanings),
    nextCourse: state.nextCourse,
    nextLesson: state.nextLesson,
    nextLessonWord: state.nextLessonWord,
    nextProgress: state.nextProgress,
    nextWordProgress: state.nextWordProgress,
    nextReviewAttempt: state.nextReviewAttempt,
    nextUserWord: state.nextUserWord,
    nextUserWordMeaning: state.nextUserWordMeaning,
  }
}

function restoreState(state, snapshot) {
  state.courses = snapshot.courses
  state.lessons = snapshot.lessons
  state.lessonWords = snapshot.lessonWords
  state.words = snapshot.words
  state.userStoryProgress = snapshot.userStoryProgress
  state.userStoryWordProgress = snapshot.userStoryWordProgress
  state.storyReviewAttempts = snapshot.storyReviewAttempts
  state.userWords = snapshot.userWords
  state.userWordMeanings = snapshot.userWordMeanings
  state.nextCourse = snapshot.nextCourse
  state.nextLesson = snapshot.nextLesson
  state.nextLessonWord = snapshot.nextLessonWord
  state.nextProgress = snapshot.nextProgress
  state.nextWordProgress = snapshot.nextWordProgress
  state.nextReviewAttempt = snapshot.nextReviewAttempt
  state.nextUserWord = snapshot.nextUserWord
  state.nextUserWordMeaning = snapshot.nextUserWordMeaning
}

/** @param {{ wordGroups?: any[] }} [options] */
export function createFakeStoryPrisma({ wordGroups = [] } = {}) {
  const state = {
    courses: new Map(),
    lessons: new Map(),
    lessonWords: new Map(),
    words: new Map(),
    userStoryProgress: new Map(),
    userStoryWordProgress: new Map(),
    storyReviewAttempts: new Map(),
    userWords: new Map(),
    userWordMeanings: new Map(),
    wordGroups,
    nextCourse: 1,
    nextLesson: 1,
    nextLessonWord: 1,
    nextProgress: 1,
    nextWordProgress: 1,
    nextReviewAttempt: 1,
    nextUserWord: 1,
    nextUserWordMeaning: 1,
  }

  const meaningsById = new Map()
  for (const group of wordGroups) {
    for (const item of group.words ?? group.items ?? []) {
      const word = item.word ?? item
      if (!word?.id) continue
      state.words.set(word.id, structuredClone(word))
      for (const meaning of word.meanings ?? []) meaningsById.set(meaning.id, meaning)
      if (word.meaning?.id) meaningsById.set(word.meaning.id, word.meaning)
      if (word.selectedMeaning?.id) meaningsById.set(word.selectedMeaning.id, word.selectedMeaning)
    }
  }

  function rowsForRelation(rows, relation) {
    const filtered = relation?.where
      ? rows.filter((row) => matchesWhere(row, relation.where))
      : rows
    const ordered = relation?.orderBy ? sortRows(filtered, relation.orderBy) : filtered
    return relation?.take ? ordered.slice(0, relation.take) : ordered
  }

  function includeLessonWordRelations(lessonWord, include) {
    if (!lessonWord) return null
    const result = structuredClone(lessonWord)
    if (include?.word) result.word = structuredClone(state.words.get(lessonWord.wordId))
    if (include?.meaning) result.meaning = structuredClone(meaningsById.get(lessonWord.meaningId))
    if (include?.userProgress) {
      result.userProgress = structuredClone(rowsForRelation(
        [...state.userStoryWordProgress.values()].filter((row) => row.lessonWordId === lessonWord.id),
        include.userProgress,
      ))
    }
    if (include?.reviewAttempts) {
      result.reviewAttempts = structuredClone(rowsForRelation(
        [...state.storyReviewAttempts.values()].filter((row) => row.lessonWordId === lessonWord.id),
        include.reviewAttempts,
      ))
    }
    if (include?.lesson) {
      result.lesson = includeLessonRelations(state.lessons.get(lessonWord.lessonId), include.lesson.include)
    }
    return result
  }

  function includeLessonRelations(lesson, include) {
    if (!lesson) return null
    const result = structuredClone(lesson)
    if (include?.userProgress) {
      result.userProgress = structuredClone(rowsForRelation(
        [...state.userStoryProgress.values()].filter((row) => row.lessonId === lesson.id),
        include.userProgress,
      ))
    }
    if (include?.words) {
      result.words = sortRows(
        [...state.lessonWords.values()]
          .filter((row) => row.lessonId === lesson.id)
          .map((row) => includeLessonWordRelations(row, include.words.include)),
        include.words.orderBy,
      )
    }
    return result
  }

  function includeCourseRelations(course, include) {
    if (!course || !include?.lessons) return course ? structuredClone(course) : null
    const lessonRows = sortRows(
      [...state.lessons.values()]
        .filter((lesson) => lesson.courseId === course.id)
        .map((lesson) => includeLessonRelations(lesson, include.lessons.include)),
      include.lessons.orderBy,
    )
    return { ...structuredClone(course), lessons: lessonRows }
  }

  const client = {
    state,
    async $transaction(callback) {
      const snapshot = snapshotState(state)
      try {
        return await callback(client)
      } catch (error) {
        restoreState(state, snapshot)
        throw error
      }
    },
    async $disconnect() {},
    wordGroup: {
      async findMany() { return structuredClone(state.wordGroups) },
    },
    word: {
      async findUnique({ where }) {
        const row = state.words.get(where.id)
        return row ? structuredClone(row) : null
      },
      async update({ where, data }) {
        const current = state.words.get(where.id)
        if (!current) throw new Error(`word not found: ${where.id}`)
        const row = { ...current, ...structuredClone(data) }
        state.words.set(row.id, row)
        return structuredClone(row)
      },
    },
    storyCourse: {
      async findFirst({ where, orderBy } = {}) {
        const rows = sortRows([...state.courses.values()].filter((row) => matchesWhere(row, where)), orderBy)
        return rows[0] ? structuredClone(rows[0]) : null
      },
      async findMany({ where, orderBy } = {}) {
        return sortRows([...state.courses.values()].filter((row) => matchesWhere(row, where)).map((row) => structuredClone(row)), orderBy)
      },
      async findUnique({ where, include } = {}) {
        const course = where.id
          ? state.courses.get(where.id)
          : [...state.courses.values()].find((row) => matchesWhere(row, where))
        return includeCourseRelations(course, include)
      },
      async aggregate() {
        const versions = [...state.courses.values()].map((course) => course.version)
        return { _max: { version: versions.length ? Math.max(...versions) : null } }
      },
      async create({ data }) {
        const course = { id: `course-${state.nextCourse++}`, ...structuredClone(data) }
        if ([...state.courses.values()].some((row) => row.version === course.version)) throw new Error('unique version violation')
        if (course.readySlot && [...state.courses.values()].some((row) => row.readySlot === course.readySlot)) throw new Error('unique ready slot violation')
        state.courses.set(course.id, course)
        return structuredClone(course)
      },
      async update({ where, data }) {
        const current = state.courses.get(where.id)
        if (!current) throw new Error(`course not found: ${where.id}`)
        const course = { ...current, ...structuredClone(data) }
        if (course.readySlot && [...state.courses.values()].some((row) => row.id !== course.id && row.readySlot === course.readySlot)) throw new Error('unique ready slot violation')
        state.courses.set(course.id, course)
        return structuredClone(course)
      },
      async updateMany({ where, data }) {
        let count = 0
        for (const [id, row] of state.courses) {
          if (!matchesWhere(row, where)) continue
          state.courses.set(id, { ...row, ...structuredClone(data) })
          count += 1
        }
        return { count }
      },
    },
    storyLesson: {
      async findMany({ where, orderBy, include } = {}) {
        return sortRows(
          [...state.lessons.values()].filter((row) => matchesWhere(row, where)).map((row) => includeLessonRelations(row, include)),
          orderBy,
        )
      },
      async findUnique({ where }) {
        const key = where.courseId_order
        const row = [...state.lessons.values()].find((lesson) => lesson.courseId === key.courseId && lesson.order === key.order)
        return row ? structuredClone(row) : null
      },
      async findFirst({ where, include } = {}) {
        const row = [...state.lessons.values()].find((lesson) => matchesWhere(lesson, where))
        return includeLessonRelations(row, include)
      },
      async upsert({ where, create, update }) {
        const key = where.courseId_order
        const current = [...state.lessons.values()].find((lesson) => lesson.courseId === key.courseId && lesson.order === key.order)
        if (current) {
          const lesson = { ...current, ...structuredClone(update) }
          state.lessons.set(lesson.id, lesson)
          return structuredClone(lesson)
        }
        const lesson = { id: `lesson-${state.nextLesson++}`, ...structuredClone(create) }
        state.lessons.set(lesson.id, lesson)
        return structuredClone(lesson)
      },
      async create({ data }) {
        const lesson = { id: `lesson-${state.nextLesson++}`, ...structuredClone(data) }
        state.lessons.set(lesson.id, lesson)
        return structuredClone(lesson)
      },
      async update({ where, data }) {
        const current = state.lessons.get(where.id)
        if (!current) throw new Error(`lesson not found: ${where.id}`)
        const lesson = { ...current, ...structuredClone(data) }
        state.lessons.set(lesson.id, lesson)
        return structuredClone(lesson)
      },
    },
    userStoryProgress: {
      async findUnique({ where }) {
        const key = where.userId_lessonId
        const row = state.userStoryProgress.get(`${key.userId}:${key.lessonId}`)
        return row ? structuredClone(row) : null
      },
      async upsert({ where, create, update }) {
        const key = where.userId_lessonId
        const stateKey = `${key.userId}:${key.lessonId}`
        const current = state.userStoryProgress.get(stateKey)
        const row = current
          ? { ...current, ...structuredClone(update) }
          : { id: `story-progress-${state.nextProgress++}`, ...structuredClone(create) }
        state.userStoryProgress.set(stateKey, row)
        return structuredClone(row)
      },
    },
    userStoryWordProgress: {
      async findUnique({ where }) {
        const key = where.userId_lessonWordId
        const row = state.userStoryWordProgress.get(`${key.userId}:${key.lessonWordId}`)
        return row ? structuredClone(row) : null
      },
      async upsert({ where, create, update }) {
        const key = where.userId_lessonWordId
        const stateKey = `${key.userId}:${key.lessonWordId}`
        const current = state.userStoryWordProgress.get(stateKey)
        const row = current
          ? { ...current, ...structuredClone(update) }
          : { id: `story-word-progress-${state.nextWordProgress++}`, ...structuredClone(create) }
        state.userStoryWordProgress.set(stateKey, row)
        return structuredClone(row)
      },
    },
    storyReviewAttempt: {
      async findUnique({ where }) {
        const key = where.userId_lessonWordId_round
        const row = state.storyReviewAttempts.get(`${key.userId}:${key.lessonWordId}:${key.round}`)
        return row ? structuredClone(row) : null
      },
      async create({ data }) {
        const stateKey = `${data.userId}:${data.lessonWordId}:${data.round}`
        if (state.storyReviewAttempts.has(stateKey)) throw new Error('unique story review attempt violation')
        const row = { id: `story-review-attempt-${state.nextReviewAttempt++}`, ...structuredClone(data) }
        state.storyReviewAttempts.set(stateKey, row)
        return structuredClone(row)
      },
    },
    userWord: {
      async upsert({ where, create, update }) {
        const key = where.userId_wordId
        const stateKey = `${key.userId}:${key.wordId}`
        const current = state.userWords.get(stateKey)
        const row = current
          ? { ...current, ...structuredClone(update) }
          : { id: `user-word-${state.nextUserWord++}`, ...structuredClone(create) }
        state.userWords.set(stateKey, row)
        return structuredClone(row)
      },
      async update({ where, data }) {
        const entry = [...state.userWords.entries()].find(([, row]) => row.id === where.id)
        if (!entry) throw new Error(`user word not found: ${where.id}`)
        const [stateKey, current] = entry
        const row = { ...current, ...structuredClone(data) }
        state.userWords.set(stateKey, row)
        return structuredClone(row)
      },
    },
    userWordMeaning: {
      async findFirst({ where }) {
        const row = [...state.userWordMeanings.values()].find((candidate) => matchesWhere(candidate, where))
        return row ? structuredClone(row) : null
      },
      async findMany({ where }) {
        return [...state.userWordMeanings.values()]
          .filter((row) => matchesWhere(row, where))
          .map((row) => structuredClone(row))
      },
      async create({ data }) {
        const row = { id: `user-word-meaning-${state.nextUserWordMeaning++}`, ...structuredClone(data) }
        state.userWordMeanings.set(row.id, row)
        return structuredClone(row)
      },
      async update({ where, data }) {
        const current = state.userWordMeanings.get(where.id)
        if (!current) throw new Error(`user word meaning not found: ${where.id}`)
        const row = { ...current, ...structuredClone(data) }
        state.userWordMeanings.set(row.id, row)
        return structuredClone(row)
      },
    },
    storyLessonWord: {
      async findFirst({ where, include } = {}) {
        const lessonWhere = where?.lesson
        const wordWhere = { ...(where ?? {}) }
        delete wordWhere.lesson
        const row = [...state.lessonWords.values()].find((candidate) => {
          if (!matchesWhere(candidate, wordWhere)) return false
          const lesson = state.lessons.get(candidate.lessonId)
          return !lessonWhere || (lesson && matchesWhere(lesson, lessonWhere))
        })
        return includeLessonWordRelations(row, include)
      },
      async deleteMany({ where }) {
        let count = 0
        for (const [id, row] of [...state.lessonWords.entries()]) {
          if (!matchesWhere(row, where)) continue
          state.lessonWords.delete(id)
          count += 1
        }
        return { count }
      },
      async createMany({ data }) {
        for (const row of data) {
          const duplicate = [...state.lessonWords.values()].find((existing) => existing.lessonId === row.lessonId && existing.wordId === row.wordId)
          if (duplicate) throw new Error('unique lesson-word violation')
          const stored = { id: `lesson-word-${state.nextLessonWord++}`, ...structuredClone(row) }
          state.lessonWords.set(stored.id, stored)
        }
        return { count: data.length }
      },
    },
  }

  return client
}
