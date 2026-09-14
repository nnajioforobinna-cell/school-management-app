export interface GradeBand {
  grade: string
  min: number
  max: number
  remark: string
}

/** Default grading scale (matches the report-card design). Configurable per school later. */
export const DEFAULT_BANDS: GradeBand[] = [
  { grade: 'A', min: 75, max: 100, remark: 'Excellent' },
  { grade: 'B', min: 65, max: 74, remark: 'Very Good' },
  { grade: 'C', min: 55, max: 64, remark: 'Good' },
  { grade: 'D', min: 45, max: 54, remark: 'Credit' },
  { grade: 'E', min: 40, max: 44, remark: 'Pass' },
  { grade: 'F', min: 0, max: 39, remark: 'Fail' },
]

/** Standard split of a 100-mark subject: continuous assessment + exam. */
export const CA_MAX = 40
export const EXAM_MAX = 60
export const CA_NAME = 'C.A.'
export const EXAM_NAME = 'Exam'

export function gradeFor(total: number, bands: GradeBand[] = DEFAULT_BANDS): GradeBand {
  return bands.find((b) => total >= b.min && total <= b.max) ?? bands[bands.length - 1]
}

/** Ordinal for class positions, e.g. 1 -> "1st", 2 -> "2nd". */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}
