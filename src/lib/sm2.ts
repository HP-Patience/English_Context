export interface SM2Result {
  easeFactor: number
  interval: number
  nextReviewAt: Date
}

export interface SM2Grade {
  quality: number // 0-5
}

/**
 * Standard SM-2 algorithm implementation.
 *
 * Quality scale (q):
 *   0: complete blackout
 *   1: remembered after seeing answer
 *   2: wrong but felt familiar
 *   3: correct with difficulty (minimum pass)
 *   4: correct after hesitation
 *   5: perfect recall
 */
export function calculateSM2(
  currentEF: number,
  currentInterval: number,
  quality: number
): SM2Result {
  const q = clampQuality(quality)
  const ef = updateEF(currentEF, q)
  const interval = calculateInterval(currentInterval, q)
  const nextReviewAt = new Date()
  nextReviewAt.setDate(nextReviewAt.getDate() + interval)

  return { easeFactor: ef, interval, nextReviewAt }
}

export function clampQuality(q: number): number {
  return Math.max(0, Math.min(5, Math.round(q)))
}

function updateEF(oldEF: number, q: number): number {
  if (q < 3) return Math.max(1.3, oldEF - 0.2)
  const ef = oldEF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  return Math.max(1.3, ef)
}

function calculateInterval(currentInterval: number, q: number): number {
  if (q < 3) return 1 // reset to 1 day

  if (currentInterval === 0) return 1  // first review: 1 day
  if (currentInterval === 1) return 6  // second review: 6 days

  return Math.round(currentInterval * updateEF(2.5, q))
}

/**
 * Merge 3-level test results into a single SM-2 grade.
 * Uses the minimum quality across all completed levels.
 */
export function mergeLevelGrades(grades: number[]): number {
  if (grades.length === 0) return 0
  return Math.min(...grades)
}
