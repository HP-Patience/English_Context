function matchesWhere(row, where = {}) {
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'NOT') return !matchesWhere(row, expected)
    if (key === 'id' && expected && typeof expected === 'object' && Object.hasOwn(expected, 'not')) return row.id !== expected.not
    if (expected && typeof expected === 'object' && Object.hasOwn(expected, 'in')) return expected.in.includes(row[key])
    if (expected && typeof expected === 'object' && Object.hasOwn(expected, 'not')) return row[key] !== expected.not
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
    users: structuredClone(state.users),
    courses: structuredClone(state.courses),
    lessons: structuredClone(state.lessons),
    lessonWords: structuredClone(state.lessonWords),
    words: structuredClone(state.words),
    meanings: structuredClone(state.meanings),
    userStoryProgress: structuredClone(state.userStoryProgress),
    userStoryWordProgress: structuredClone(state.userStoryWordProgress),
    storyReviewAttempts: structuredClone(state.storyReviewAttempts),
    userStoryParagraphCompletions: structuredClone(state.userStoryParagraphCompletions),
    userStoryStepCompletions: structuredClone(state.userStoryStepCompletions),
    userStoryLessonCompletions: structuredClone(state.userStoryLessonCompletions),
    userStoryParagraphBookmarks: structuredClone(state.userStoryParagraphBookmarks),
    userWords: structuredClone(state.userWords),
    userWordMeanings: structuredClone(state.userWordMeanings),
    nextUser: state.nextUser,
    nextCourse: state.nextCourse,
    nextLesson: state.nextLesson,
    nextLessonWord: state.nextLessonWord,
    nextProgress: state.nextProgress,
    nextWordProgress: state.nextWordProgress,
    nextReviewAttempt: state.nextReviewAttempt,
    nextParagraphCompletion: state.nextParagraphCompletion,
    nextStepCompletion: state.nextStepCompletion,
    nextLessonCompletion: state.nextLessonCompletion,
    nextParagraphBookmark: state.nextParagraphBookmark,
    nextUserWord: state.nextUserWord,
    nextUserWordMeaning: state.nextUserWordMeaning,
  }
}

function restoreState(state, snapshot) {
  state.users = snapshot.users
  state.courses = snapshot.courses
  state.lessons = snapshot.lessons
  state.lessonWords = snapshot.lessonWords
  state.words = snapshot.words
  state.meanings = snapshot.meanings
  state.userStoryProgress = snapshot.userStoryProgress
  state.userStoryWordProgress = snapshot.userStoryWordProgress
  state.storyReviewAttempts = snapshot.storyReviewAttempts
  state.userStoryParagraphCompletions = snapshot.userStoryParagraphCompletions
  state.userStoryStepCompletions = snapshot.userStoryStepCompletions
  state.userStoryLessonCompletions = snapshot.userStoryLessonCompletions
  state.userStoryParagraphBookmarks = snapshot.userStoryParagraphBookmarks
  state.userWords = snapshot.userWords
  state.userWordMeanings = snapshot.userWordMeanings
  state.nextUser = snapshot.nextUser
  state.nextCourse = snapshot.nextCourse
  state.nextLesson = snapshot.nextLesson
  state.nextLessonWord = snapshot.nextLessonWord
  state.nextProgress = snapshot.nextProgress
  state.nextWordProgress = snapshot.nextWordProgress
  state.nextReviewAttempt = snapshot.nextReviewAttempt
  state.nextParagraphCompletion = snapshot.nextParagraphCompletion
  state.nextStepCompletion = snapshot.nextStepCompletion
  state.nextLessonCompletion = snapshot.nextLessonCompletion
  state.nextParagraphBookmark = snapshot.nextParagraphBookmark
  state.nextUserWord = snapshot.nextUserWord
  state.nextUserWordMeaning = snapshot.nextUserWordMeaning
}

/** @param {{ wordGroups?: any[] }} [options] */
export function createFakeStoryPrisma({ wordGroups = [] } = {}) {
  const state = {
    users: new Map(),
    courses: new Map(),
    lessons: new Map(),
    lessonWords: new Map(),
    words: new Map(),
    meanings: new Map(),
    userStoryProgress: new Map(),
    userStoryWordProgress: new Map(),
    storyReviewAttempts: new Map(),
    userStoryParagraphCompletions: new Map(),
    userStoryStepCompletions: new Map(),
    userStoryLessonCompletions: new Map(),
    userStoryParagraphBookmarks: new Map(),
    userWords: new Map(),
    userWordMeanings: new Map(),
    wordGroups,
    nextUser: 1,
    nextCourse: 1,
    nextLesson: 1,
    nextLessonWord: 1,
    nextProgress: 1,
    nextWordProgress: 1,
    nextReviewAttempt: 1,
    nextParagraphCompletion: 1,
    nextStepCompletion: 1,
    nextLessonCompletion: 1,
    nextParagraphBookmark: 1,
    nextUserWord: 1,
    nextUserWordMeaning: 1,
  }

  const meaningsById = state.meanings
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

  function fixtureError(message) {
    return new Error(`fake Prisma fixture integrity violation: ${message}`)
  }

  function requireUser(userId) {
    if (!state.users.has(userId)) throw fixtureError(`unknown user ${userId}`)
    return state.users.get(userId)
  }

  function requireCourse(courseId) {
    if (!state.courses.has(courseId)) throw fixtureError(`unknown story course ${courseId}`)
    return state.courses.get(courseId)
  }

  function requireLesson(lessonId) {
    if (!state.lessons.has(lessonId)) throw fixtureError(`unknown story lesson ${lessonId}`)
    return state.lessons.get(lessonId)
  }

  function matchesLessonWhere(lesson, where = {}) {
    const { course: courseWhere, ...lessonWhere } = where
    if (!matchesWhere(lesson, lessonWhere)) return false
    return !courseWhere || matchesWhere(requireCourse(lesson.courseId), courseWhere)
  }

  function matchesLessonWordWhere(lessonWord, where = {}) {
    const { lesson: lessonWhere, ...wordWhere } = where
    if (!matchesWhere(lessonWord, wordWhere)) return false
    return !lessonWhere || matchesLessonWhere(requireLesson(lessonWord.lessonId), lessonWhere)
  }

  function requireLessonWord(lessonWordId) {
    if (!state.lessonWords.has(lessonWordId)) throw fixtureError(`unknown story lesson word ${lessonWordId}`)
    return state.lessonWords.get(lessonWordId)
  }

  function requireWord(wordId) {
    if (!state.words.has(wordId)) throw fixtureError(`unknown word ${wordId}`)
    return state.words.get(wordId)
  }

  function requireMeaning(meaningId) {
    if (!state.meanings.has(meaningId)) throw fixtureError(`unknown meaning ${meaningId}`)
    return state.meanings.get(meaningId)
  }

  function requireUserWord(userWordId) {
    const row = [...state.userWords.values()].find((candidate) => candidate.id === userWordId)
    if (!row) throw fixtureError(`unknown user word ${userWordId}`)
    requireUser(row.userId)
    return row
  }

  function assertRequiredString(row, field, table) {
    if (typeof row[field] !== 'string' || row[field].length === 0) {
      throw fixtureError(`${table}.${field} must be a non-empty string`)
    }
  }

  function assertUnique(rows, keyFor, label, { ignoreNull = false } = {}) {
    const seen = new Set()
    for (const row of rows) {
      const key = keyFor(row)
      if (ignoreNull && key == null) continue
      if (seen.has(key)) throw fixtureError(`duplicate ${label}: ${key}`)
      seen.add(key)
    }
  }

  function assertMapIds(table, rows) {
    for (const [key, row] of rows) {
      if (row.id !== key) throw fixtureError(`${table} map key ${key} does not match row id ${row.id}`)
    }
  }

  function validateFixture() {
    assertMapIds('User', state.users)
    assertMapIds('StoryCourse', state.courses)
    assertMapIds('StoryLesson', state.lessons)
    assertMapIds('StoryLessonWord', state.lessonWords)
    assertMapIds('Word', state.words)
    assertMapIds('Meaning', state.meanings)
    assertMapIds('UserWordMeaning', state.userWordMeanings)
    assertMapIds('UserStoryParagraphCompletion', state.userStoryParagraphCompletions)
    assertMapIds('UserStoryStepCompletion', state.userStoryStepCompletions)
    assertMapIds('UserStoryLessonCompletion', state.userStoryLessonCompletions)
    assertMapIds('UserStoryParagraphBookmark', state.userStoryParagraphBookmarks)

    const users = [...state.users.values()]
    assertUnique(users, (row) => row.email, 'User.email', { ignoreNull: true })
    for (const user of users) assertRequiredString(user, 'id', 'User')

    const courses = [...state.courses.values()]
    assertUnique(courses, (row) => row.version, 'StoryCourse.version')
    assertUnique(courses, (row) => row.readySlot, 'StoryCourse.readySlot', { ignoreNull: true })
    for (const course of courses) {
      assertRequiredString(course, 'id', 'StoryCourse')
      assertRequiredString(course, 'status', 'StoryCourse')
      for (const field of ['sourceFingerprint', 'summaryFingerprint', 'outlineFingerprint', 'assignmentFingerprint']) {
        assertRequiredString(course, field, 'StoryCourse')
      }
      if (!Number.isInteger(course.version)) throw fixtureError('StoryCourse.version must be an integer')
    }

    const groupIds = new Set()
    for (const group of state.wordGroups) {
      assertRequiredString(group, 'id', 'WordGroup')
      if (groupIds.has(group.id)) throw fixtureError(`duplicate WordGroup.id: ${group.id}`)
      groupIds.add(group.id)
      for (const item of group.words ?? group.items ?? []) {
        const word = item.word ?? item
        if (word?.id) requireWord(word.id)
      }
    }

    const words = [...state.words.values()]
    for (const word of words) {
      assertRequiredString(word, 'id', 'Word')
      assertRequiredString(word, 'text', 'Word')
      assertRequiredString(word, 'language', 'Word')
    }
    for (const meaning of state.meanings.values()) {
      assertRequiredString(meaning, 'id', 'Meaning')
      assertRequiredString(meaning, 'wordId', 'Meaning')
      assertRequiredString(meaning, 'partOfSpeech', 'Meaning')
      assertRequiredString(meaning, 'definition', 'Meaning')
      requireWord(meaning.wordId)
    }

    const lessons = [...state.lessons.values()]
    assertUnique(lessons, (row) => `${row.courseId}:${row.order}`, 'StoryLesson(courseId,order)')
    for (const lesson of lessons) {
      requireCourse(lesson.courseId)
      for (const field of [
        'id', 'title', 'sourceChapterStart', 'sourceChapterEnd', 'sourceSummary',
        'continuityNotes', 'contentJson', 'status',
      ]) assertRequiredString(lesson, field, 'StoryLesson')
      if (!Number.isInteger(lesson.order)) throw fixtureError('StoryLesson.order must be an integer')
      if (lesson.wordGroupId !== null && lesson.wordGroupId !== undefined && !groupIds.has(lesson.wordGroupId)) {
        throw fixtureError(`unknown word group ${lesson.wordGroupId}`)
      }
      try {
        JSON.parse(lesson.contentJson)
      } catch {
        throw fixtureError(`StoryLesson.contentJson is invalid JSON for ${lesson.id}`)
      }
    }

    const lessonWords = [...state.lessonWords.values()]
    assertUnique(lessonWords, (row) => `${row.lessonId}:${row.wordId}`, 'StoryLessonWord(lessonId,wordId)')
    for (const lessonWord of lessonWords) {
      requireLesson(lessonWord.lessonId)
      requireWord(lessonWord.wordId)
      const meaning = requireMeaning(lessonWord.meaningId)
      if (meaning.wordId !== lessonWord.wordId) {
        throw fixtureError(`meaning ${meaning.id} does not belong to word ${lessonWord.wordId}`)
      }
      assertRequiredString(lessonWord, 'glossCn', 'StoryLessonWord')
      if (!Number.isInteger(lessonWord.sortOrder)) throw fixtureError('StoryLessonWord.sortOrder must be an integer')
    }

    for (const [key, row] of state.userStoryProgress) {
      if (key !== `${row.userId}:${row.lessonId}`) throw fixtureError(`invalid UserStoryProgress key ${key}`)
      requireUser(row.userId)
      requireLesson(row.lessonId)
    }
    for (const [key, row] of state.userStoryWordProgress) {
      if (key !== `${row.userId}:${row.lessonWordId}`) throw fixtureError(`invalid UserStoryWordProgress key ${key}`)
      requireUser(row.userId)
      requireLessonWord(row.lessonWordId)
    }
    for (const [key, row] of state.storyReviewAttempts) {
      if (key !== `${row.userId}:${row.lessonWordId}:${row.round}`) throw fixtureError(`invalid StoryReviewAttempt key ${key}`)
      requireUser(row.userId)
      requireLessonWord(row.lessonWordId)
    }
    for (const rows of [
      state.userStoryParagraphCompletions,
      state.userStoryStepCompletions,
      state.userStoryLessonCompletions,
    ]) {
      assertUnique([...rows.values()], (row) => `${row.userId}:${row.completionId}`, 'story completion(userId,completionId)')
      for (const row of rows.values()) {
        requireUser(row.userId)
        requireLesson(row.lessonId)
      }
    }
    assertUnique(
      [...state.userStoryParagraphBookmarks.values()],
      (row) => `${row.userId}:${row.lessonId}:${row.paragraphIndex}`,
      'UserStoryParagraphBookmark(userId,lessonId,paragraphIndex)',
    )
    for (const row of state.userStoryParagraphBookmarks.values()) {
      requireUser(row.userId)
      requireLesson(row.lessonId)
    }
    for (const [key, row] of state.userWords) {
      if (key !== `${row.userId}:${row.wordId}`) throw fixtureError(`invalid UserWord key ${key}`)
      requireUser(row.userId)
      requireWord(row.wordId)
    }
    for (const row of state.userWordMeanings.values()) {
      requireUserWord(row.userWordId)
      requireMeaning(row.meaningId)
    }

    return true
  }

  function rowsForRelation(rows, relation) {
    const filtered = relation?.where
      ? rows.filter((row) => matchesWhere(row, relation.where))
      : rows
    const ordered = relation?.orderBy ? sortRows(filtered, relation.orderBy) : filtered
    return relation?.take ? ordered.slice(0, relation.take) : ordered
  }

  function includeLessonWordRelations(lessonWord, relations) {
    if (!lessonWord) return null
    const include = relations?.select ?? relations?.include ?? relations
    const result = structuredClone(lessonWord)
    if (include?.word) result.word = structuredClone(state.words.get(lessonWord.wordId))
    if (include?.meaning) result.meaning = structuredClone(state.meanings.get(lessonWord.meaningId))
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
      result.lesson = includeLessonRelations(state.lessons.get(lessonWord.lessonId), include.lesson)
    }
    return result
  }

  function includeLessonRelations(lesson, relations) {
    if (!lesson) return null
    const include = relations?.select ?? relations?.include ?? relations
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
          .map((row) => includeLessonWordRelations(row, include.words)),
        include.words.orderBy,
      )
    }
    return result
  }

  function includeCourseRelations(course, relations) {
    const include = relations?.select ?? relations?.include ?? relations
    if (!course || !include?.lessons) return course ? structuredClone(course) : null
    const lessonRows = sortRows(
      [...state.lessons.values()]
        .filter((lesson) => lesson.courseId === course.id && matchesWhere(lesson, include.lessons.where))
        .map((lesson) => includeLessonRelations(lesson, include.lessons)),
      include.lessons.orderBy,
    )
    return { ...structuredClone(course), lessons: lessonRows }
  }

  function completionDelegate(rows, idPrefix, counterField) {
    return {
      async findMany({ where } = {}) {
        return [...rows.values()]
          .filter((row) => matchesWhere(row, where))
          .sort((left, right) => (
            new Date(right.completionDate).getTime() - new Date(left.completionDate).getTime()
            || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
            || left.id.localeCompare(right.id)
          ))
          .map((row) => structuredClone(row))
      },
      async groupBy({ by, where } = {}) {
        const groups = new Map()
        for (const row of rows.values()) {
          if (!matchesWhere(row, where)) continue
          const dimensions = Object.fromEntries(by.map((field) => [field, row[field]]))
          const key = JSON.stringify(dimensions)
          const current = groups.get(key)
          const completionDate = current === undefined || new Date(row.completionDate) > new Date(current._max.completionDate)
            ? row.completionDate
            : current._max.completionDate
          groups.set(key, {
            ...dimensions,
            _count: { _all: (current?._count._all ?? 0) + 1 },
            _max: { completionDate },
          })
        }
        return structuredClone([...groups.values()])
      },
      async upsert({ where, create, update }) {
        const key = where.userId_completionId
        const current = [...rows.values()].find((row) => row.userId === key.userId && row.completionId === key.completionId)
        if (current) return structuredClone({ ...current, ...structuredClone(update) })
        requireUser(create.userId)
        requireLesson(create.lessonId)
        const row = {
          id: `${idPrefix}-${state[counterField]++}`,
          createdAt: new Date(),
          ...structuredClone(create),
        }
        rows.set(row.id, row)
        return structuredClone(row)
      },
      async update({ where, data }) {
        const current = rows.get(where.id)
        if (!current) throw new Error(`${idPrefix} not found: ${where.id}`)
        const row = { ...current, ...structuredClone(data) }
        requireLesson(row.lessonId)
        rows.set(row.id, row)
        return structuredClone(row)
      },
    }
  }

  const client = {
    state,
    validateFixture,
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
    user: {
      async findUnique({ where }) {
        const row = where.id
          ? state.users.get(where.id)
          : [...state.users.values()].find((candidate) => matchesWhere(candidate, where))
        return row ? structuredClone(row) : null
      },
      async upsert({ where, create, update }) {
        const current = where.id
          ? state.users.get(where.id)
          : [...state.users.values()].find((candidate) => matchesWhere(candidate, where))
        const row = current
          ? { ...current, ...structuredClone(update) }
          : {
              id: `user-${state.nextUser++}`,
              email: null,
              name: null,
              interests: '[]',
              llmConfig: null,
              dailyTarget: 30,
              ttsConfig: '{}',
              createdAt: new Date(),
              ...structuredClone(create),
            }
        assertRequiredString(row, 'id', 'User')
        if (!current && where.id && row.id !== where.id) throw fixtureError('User upsert key does not match create data')
        const duplicateEmail = row.email !== null && row.email !== undefined
          ? [...state.users.values()].find((candidate) => candidate.id !== row.id && candidate.email === row.email)
          : null
        if (duplicateEmail) throw new Error('unique user email violation')
        if (current && row.id !== current.id) throw fixtureError('User.id cannot be changed')
        state.users.set(row.id, row)
        return structuredClone(row)
      },
    },
    wordGroup: {
      async findMany() { return structuredClone(state.wordGroups) },
    },
    word: {
      async findUnique({ where, include }) {
        const row = state.words.get(where.id)
        if (!row) return null
        const result = structuredClone(row)
        if (include?.meanings) {
          result.meanings = [...state.meanings.values()]
            .filter((meaning) => meaning.wordId === row.id)
            .map((meaning) => ({ ...structuredClone(meaning), userWordMeanings: [] }))
        }
        if (include?.userWords) {
          result.userWords = [...state.userWords.values()]
            .filter((userWord) => userWord.wordId === row.id && matchesWhere(userWord, include.userWords.where))
            .map((userWord) => structuredClone(userWord))
        }
        if (include?.groups) result.groups = []
        return result
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
      async findUnique({ where, include, select } = {}) {
        const course = where.id
          ? state.courses.get(where.id)
          : [...state.courses.values()].find((row) => matchesWhere(row, where))
        return includeCourseRelations(course, include ?? select)
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
          [...state.lessons.values()].filter((row) => matchesLessonWhere(row, where)).map((row) => includeLessonRelations(row, include)),
          orderBy,
        )
      },
      async findUnique({ where }) {
        if (where.id) {
          const row = state.lessons.get(where.id)
          return row ? structuredClone(row) : null
        }
        const key = where.courseId_order
        const row = [...state.lessons.values()].find((lesson) => lesson.courseId === key.courseId && lesson.order === key.order)
        return row ? structuredClone(row) : null
      },
      async findFirst({ where, include } = {}) {
        const row = [...state.lessons.values()].find((lesson) => matchesLessonWhere(lesson, where))
        return includeLessonRelations(row, include)
      },
      async upsert({ where, create, update }) {
        const key = where.courseId_order
        requireCourse(key.courseId)
        const current = [...state.lessons.values()].find((lesson) => lesson.courseId === key.courseId && lesson.order === key.order)
        if (current) {
          const lesson = { ...current, ...structuredClone(update) }
          requireCourse(lesson.courseId)
          const duplicate = [...state.lessons.values()].find((candidate) => (
            candidate.id !== lesson.id && candidate.courseId === lesson.courseId && candidate.order === lesson.order
          ))
          if (duplicate) throw new Error('unique course lesson order violation')
          state.lessons.set(lesson.id, lesson)
          return structuredClone(lesson)
        }
        if (create.courseId !== key.courseId || create.order !== key.order) {
          throw fixtureError('StoryLesson upsert key does not match create data')
        }
        const lesson = { id: `lesson-${state.nextLesson++}`, ...structuredClone(create) }
        state.lessons.set(lesson.id, lesson)
        return structuredClone(lesson)
      },
      async create({ data }) {
        requireCourse(data.courseId)
        const duplicate = [...state.lessons.values()].find((candidate) => (
          candidate.courseId === data.courseId && candidate.order === data.order
        ))
        if (duplicate) throw new Error('unique course lesson order violation')
        const lesson = { id: `lesson-${state.nextLesson++}`, ...structuredClone(data) }
        state.lessons.set(lesson.id, lesson)
        return structuredClone(lesson)
      },
      async update({ where, data }) {
        const current = state.lessons.get(where.id)
        if (!current) throw new Error(`lesson not found: ${where.id}`)
        const lesson = { ...current, ...structuredClone(data) }
        requireCourse(lesson.courseId)
        const duplicate = [...state.lessons.values()].find((candidate) => (
          candidate.id !== lesson.id && candidate.courseId === lesson.courseId && candidate.order === lesson.order
        ))
        if (duplicate) throw new Error('unique course lesson order violation')
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
        if (create.userId !== key.userId || create.lessonId !== key.lessonId) {
          throw fixtureError('UserStoryProgress upsert key does not match create data')
        }
        requireUser(key.userId)
        requireLesson(key.lessonId)
        const stateKey = `${key.userId}:${key.lessonId}`
        const current = state.userStoryProgress.get(stateKey)
        const row = current
          ? { ...current, ...structuredClone(update) }
          : { id: `story-progress-${state.nextProgress++}`, ...structuredClone(create) }
        if (row.userId !== key.userId || row.lessonId !== key.lessonId) {
          throw fixtureError('UserStoryProgress update cannot change its unique key')
        }
        state.userStoryProgress.set(stateKey, row)
        return structuredClone(row)
      },
      async updateMany({ where, data }) {
        let count = 0
        for (const [stateKey, current] of state.userStoryProgress) {
          const statusMatches = typeof where.status === 'object'
            ? current.status !== where.status.not
            : where.status === undefined || current.status === where.status
          if (current.userId !== where.userId || current.lessonId !== where.lessonId || !statusMatches) continue
          state.userStoryProgress.set(stateKey, { ...current, ...structuredClone(data) })
          count += 1
        }
        return { count }
      },
    },
    userStoryParagraphCompletion: completionDelegate(
      state.userStoryParagraphCompletions,
      'story-paragraph-completion',
      'nextParagraphCompletion',
    ),
    userStoryStepCompletion: completionDelegate(
      state.userStoryStepCompletions,
      'story-step-completion',
      'nextStepCompletion',
    ),
    userStoryLessonCompletion: completionDelegate(
      state.userStoryLessonCompletions,
      'story-lesson-completion',
      'nextLessonCompletion',
    ),
    userStoryParagraphBookmark: {
      async findMany({ where } = {}) {
        return [...state.userStoryParagraphBookmarks.values()]
          .filter((row) => {
            const { lesson: lessonWhere, ...bookmarkWhere } = where ?? {}
            return matchesWhere(row, bookmarkWhere)
              && (!lessonWhere || matchesLessonWhere(requireLesson(row.lessonId), lessonWhere))
          })
          .map((row) => ({
            ...structuredClone(row),
            lesson: includeLessonRelations(requireLesson(row.lessonId), { select: { order: true, title: true, contentJson: true } }),
          }))
      },
      async findUnique({ where }) {
        const key = where.userId_lessonId_paragraphIndex
        const row = [...state.userStoryParagraphBookmarks.values()].find((candidate) => (
          candidate.userId === key.userId
          && candidate.lessonId === key.lessonId
          && candidate.paragraphIndex === key.paragraphIndex
        ))
        return row ? {
          ...structuredClone(row),
          lesson: includeLessonRelations(requireLesson(row.lessonId), { select: { order: true, title: true, contentJson: true } }),
        } : null
      },
      async create({ data }) {
        requireUser(data.userId)
        const lesson = requireLesson(data.lessonId)
        const duplicate = [...state.userStoryParagraphBookmarks.values()].find((row) => (
          row.userId === data.userId && row.lessonId === data.lessonId && row.paragraphIndex === data.paragraphIndex
        ))
        if (duplicate) throw new Error('unique story paragraph bookmark violation')
        const row = { id: `story-paragraph-bookmark-${state.nextParagraphBookmark++}`, createdAt: new Date(), ...structuredClone(data) }
        state.userStoryParagraphBookmarks.set(row.id, row)
        return { ...structuredClone(row), lesson: structuredClone(lesson) }
      },
      async delete({ where }) {
        const key = where.userId_lessonId_paragraphIndex
        const entry = [...state.userStoryParagraphBookmarks.entries()].find(([, row]) => (
          row.userId === key.userId && row.lessonId === key.lessonId && row.paragraphIndex === key.paragraphIndex
        ))
        if (!entry) throw new Error('story paragraph bookmark not found')
        state.userStoryParagraphBookmarks.delete(entry[0])
        return structuredClone(entry[1])
      },
      async update({ where, data }) {
        const current = state.userStoryParagraphBookmarks.get(where.id)
        if (!current) throw new Error(`story paragraph bookmark not found: ${where.id}`)
        const row = { ...current, ...structuredClone(data) }
        requireLesson(row.lessonId)
        state.userStoryParagraphBookmarks.set(row.id, row)
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
        if (create.userId !== key.userId || create.lessonWordId !== key.lessonWordId) {
          throw fixtureError('UserStoryWordProgress upsert key does not match create data')
        }
        requireUser(key.userId)
        requireLessonWord(key.lessonWordId)
        const stateKey = `${key.userId}:${key.lessonWordId}`
        const current = state.userStoryWordProgress.get(stateKey)
        const row = current
          ? { ...current, ...structuredClone(update) }
          : { id: `story-word-progress-${state.nextWordProgress++}`, ...structuredClone(create) }
        if (row.userId !== key.userId || row.lessonWordId !== key.lessonWordId) {
          throw fixtureError('UserStoryWordProgress update cannot change its unique key')
        }
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
        requireUser(data.userId)
        requireLessonWord(data.lessonWordId)
        const stateKey = `${data.userId}:${data.lessonWordId}:${data.round}`
        if (state.storyReviewAttempts.has(stateKey)) throw new Error('unique story review attempt violation')
        const row = { id: `story-review-attempt-${state.nextReviewAttempt++}`, ...structuredClone(data) }
        state.storyReviewAttempts.set(stateKey, row)
        return structuredClone(row)
      },
    },
    userWord: {
      async findMany({ where } = {}) {
        return [...state.userWords.values()]
          .filter((row) => matchesWhere(row, where))
          .map((row) => structuredClone(row))
      },
      async findUnique({ where }) {
        const key = where.userId_wordId
        const row = state.userWords.get(`${key.userId}:${key.wordId}`)
        return row ? structuredClone(row) : null
      },
      async upsert({ where, create, update }) {
        const key = where.userId_wordId
        if (create.userId !== key.userId || create.wordId !== key.wordId) {
          throw fixtureError('UserWord upsert key does not match create data')
        }
        requireUser(key.userId)
        requireWord(key.wordId)
        const stateKey = `${key.userId}:${key.wordId}`
        const current = state.userWords.get(stateKey)
        const row = current
          ? { ...current, ...structuredClone(update) }
          : { id: `user-word-${state.nextUserWord++}`, ...structuredClone(create) }
        if (row.userId !== key.userId || row.wordId !== key.wordId) {
          throw fixtureError('UserWord update cannot change its unique key')
        }
        state.userWords.set(stateKey, row)
        return structuredClone(row)
      },
      async update({ where, data }) {
        const entry = [...state.userWords.entries()].find(([, row]) => row.id === where.id)
        if (!entry) throw new Error(`user word not found: ${where.id}`)
        const [stateKey, current] = entry
        const row = { ...current, ...structuredClone(data) }
        requireUser(row.userId)
        requireWord(row.wordId)
        if (stateKey !== `${row.userId}:${row.wordId}`) throw fixtureError('UserWord update cannot change its unique key')
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
        requireUserWord(data.userWordId)
        requireMeaning(data.meaningId)
        const row = { id: `user-word-meaning-${state.nextUserWordMeaning++}`, ...structuredClone(data) }
        state.userWordMeanings.set(row.id, row)
        return structuredClone(row)
      },
      async update({ where, data }) {
        const current = state.userWordMeanings.get(where.id)
        if (!current) throw new Error(`user word meaning not found: ${where.id}`)
        const row = { ...current, ...structuredClone(data) }
        requireUserWord(row.userWordId)
        requireMeaning(row.meaningId)
        state.userWordMeanings.set(row.id, row)
        return structuredClone(row)
      },
    },
    storyLessonWord: {
      async findMany({ where, include } = {}) {
        return [...state.lessonWords.values()]
          .filter((row) => matchesLessonWordWhere(row, where))
          .map((row) => includeLessonWordRelations(row, include))
      },
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
        const pendingKeys = new Set()
        for (const row of data) {
          requireLesson(row.lessonId)
          requireWord(row.wordId)
          const meaning = requireMeaning(row.meaningId)
          if (meaning.wordId !== row.wordId) throw fixtureError(`meaning ${row.meaningId} does not belong to word ${row.wordId}`)
          const uniqueKey = `${row.lessonId}:${row.wordId}`
          const duplicate = pendingKeys.has(uniqueKey) || [...state.lessonWords.values()].find((existing) => (
            existing.lessonId === row.lessonId && existing.wordId === row.wordId
          ))
          if (duplicate) throw new Error('unique lesson-word violation')
          pendingKeys.add(uniqueKey)
        }
        for (const row of data) {
          const stored = { id: `lesson-word-${state.nextLessonWord++}`, ...structuredClone(row) }
          state.lessonWords.set(stored.id, stored)
        }
        return { count: data.length }
      },
    },
  }

  return client
}
