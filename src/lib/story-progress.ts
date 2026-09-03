export type StoryFirstPassStep = 1 | 2 | 3
export type StoryLessonStep = StoryFirstPassStep | 4

export type StoryProgressStatus =
  | 'not_started'
  | 'learning'
  | 'first_passed'
  | 'reviewing'
  | 'reinforced'

export type StoryProgressState = {
  status: StoryProgressStatus
  completedSteps: StoryFirstPassStep[]
  reviewRoundCompleted: number
}

export const initialProgress: StoryProgressState = {
  status: 'not_started',
  completedSteps: [],
  reviewRoundCompleted: 0,
}

export function getNextStep(progress: StoryProgressState): StoryLessonStep {
  if (progress.completedSteps.includes(3)) {
    return 4
  }

  if (!progress.completedSteps.includes(1)) {
    return 1
  }

  if (!progress.completedSteps.includes(2)) {
    return 2
  }

  return 3
}

export function completeFirstPass(
  progress: StoryProgressState,
  step: StoryFirstPassStep,
): StoryProgressState {
  if (progress.completedSteps.includes(step)) {
    return { ...progress, completedSteps: [...progress.completedSteps] }
  }

  const completedSteps = [...progress.completedSteps, step]

  return {
    ...progress,
    completedSteps,
    status: completedSteps.includes(3) ? 'first_passed' : 'learning',
  }
}

export function canOpenLesson(progress: StoryProgressState): boolean {
  return (
    progress.status === 'not_started' ||
    progress.status === 'learning' ||
    progress.status === 'first_passed' ||
    progress.status === 'reviewing' ||
    progress.status === 'reinforced'
  )
}
