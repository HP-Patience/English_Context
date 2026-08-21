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
    nextCourse: state.nextCourse,
    nextLesson: state.nextLesson,
    nextLessonWord: state.nextLessonWord,
  }
}

function restoreState(state, snapshot) {
  state.courses = snapshot.courses
  state.lessons = snapshot.lessons
  state.lessonWords = snapshot.lessonWords
  state.words = snapshot.words
  state.nextCourse = snapshot.nextCourse
  state.nextLesson = snapshot.nextLesson
  state.nextLessonWord = snapshot.nextLessonWord
}

/** @param {{ wordGroups?: any[] }} [options] */
export function createFakeStoryPrisma({ wordGroups = [] } = {}) {
  const state = {
    courses: new Map(),
    lessons: new Map(),
    lessonWords: new Map(),
    words: new Map(),
    wordGroups,
    nextCourse: 1,
    nextLesson: 1,
    nextLessonWord: 1,
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

  function includeLessonRelations(lesson, include) {
    if (!lesson) return null
    const result = structuredClone(lesson)
    if (include?.userProgress) result.userProgress = []
    if (include?.words) {
      result.words = sortRows(
        [...state.lessonWords.values()]
          .filter((row) => row.lessonId === lesson.id)
          .map((row) => ({
            ...structuredClone(row),
            ...(include.words.include?.word ? { word: structuredClone(state.words.get(row.wordId)) } : {}),
            ...(include.words.include?.meaning ? { meaning: structuredClone(meaningsById.get(row.meaningId)) } : {}),
            ...(include.words.include?.userProgress ? { userProgress: [] } : {}),
          })),
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
    storyLessonWord: {
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
