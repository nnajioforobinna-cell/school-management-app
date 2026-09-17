import { CA_NAME, EXAM_NAME, gradeFor } from '@/lib/grading'

export interface RawEnrollment {
  student_id: string
  class_arm_id: string
  students: { first_name: string; last_name: string; middle_name: string | null; admission_no: string | null; gender: string | null; photo_url: string | null } | null
}
export interface RawAssessment {
  id: string
  name: string
  subject_id: string
  class_arm_id: string
  subjects: { name: string } | null
}
export interface RawScore {
  assessment_id: string
  student_id: string
  score: number | null
}

export interface SubjectResult {
  subjectId: string
  name: string
  ca: number | null
  exam: number | null
  total: number | null
  grade: string | null
  remark: string | null
}
export interface StudentResult {
  studentId: string
  classArmId: string
  firstName: string
  lastName: string
  middleName: string | null
  admissionNo: string | null
  gender: string | null
  photoPath: string | null
  subjects: SubjectResult[]
  total: number
  average: number
  grade: string
  position: number
  subjectCount: number
}

interface AsmtMeta {
  subjectId: string
  name: string
  caId?: string
  examId?: string
}

/**
 * Aggregate raw scores into per-student subject results, averages, and positions.
 *
 * Handles multiple class arms at once so positions can be ranked across a whole
 * class level (e.g. all of JSS 1), not just one arm. Each student's subjects are
 * the ones assessed for THEIR arm, optionally narrowed to the subjects they
 * offer (`offered`); a student absent from `offered` takes all assessed subjects.
 * Ranking is by average %.
 */
export function computeClassResults(
  enrollments: RawEnrollment[],
  assessments: RawAssessment[],
  scores: RawScore[],
  offered?: Map<string, Set<string>>,
): StudentResult[] {
  // Assessments grouped by arm + subject (CA/Exam pair per arm/subject).
  const asmt = new Map<string, AsmtMeta>()
  const armSubjects = new Map<string, Set<string>>()
  for (const a of assessments) {
    const key = `${a.class_arm_id}::${a.subject_id}`
    const meta = asmt.get(key) ?? { subjectId: a.subject_id, name: a.subjects?.name ?? '—' }
    if (a.name === CA_NAME) meta.caId = a.id
    else if (a.name === EXAM_NAME) meta.examId = a.id
    asmt.set(key, meta)
    const set = armSubjects.get(a.class_arm_id) ?? new Set<string>()
    set.add(a.subject_id)
    armSubjects.set(a.class_arm_id, set)
  }

  const scoreMap = new Map<string, number>()
  for (const s of scores) {
    if (s.score != null) scoreMap.set(`${s.assessment_id}:${s.student_id}`, s.score)
  }

  const students: StudentResult[] = enrollments.map((e) => {
    const armId = e.class_arm_id
    const assessed = [...(armSubjects.get(armId) ?? new Set<string>())]
    const offeredSet = offered?.get(e.student_id) // undefined => takes all assessed subjects
    const subjectResults: SubjectResult[] = assessed
      .filter((sid) => !offeredSet || offeredSet.has(sid))
      .map((sid) => {
        const meta = asmt.get(`${armId}::${sid}`)!
        const ca = meta.caId ? (scoreMap.get(`${meta.caId}:${e.student_id}`) ?? null) : null
        const exam = meta.examId ? (scoreMap.get(`${meta.examId}:${e.student_id}`) ?? null) : null
        const hasAny = ca != null || exam != null
        const total = hasAny ? (ca ?? 0) + (exam ?? 0) : null
        const band = total != null ? gradeFor(total) : null
        return {
          subjectId: sid,
          name: meta.name,
          ca,
          exam,
          total,
          grade: band?.grade ?? null,
          remark: band?.remark ?? null,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))

    // Average over the subjects that actually have a result.
    const scored = subjectResults.filter((s) => s.total != null)
    const total = scored.reduce((sum, s) => sum + (s.total ?? 0), 0)
    const average = scored.length ? Math.round((total / scored.length) * 10) / 10 : 0
    return {
      studentId: e.student_id,
      classArmId: armId,
      firstName: e.students?.first_name ?? '',
      lastName: e.students?.last_name ?? '',
      middleName: e.students?.middle_name ?? null,
      admissionNo: e.students?.admission_no ?? null,
      gender: e.students?.gender ?? null,
      photoPath: e.students?.photo_url ?? null,
      subjects: subjectResults,
      total,
      average,
      grade: gradeFor(average).grade,
      position: 0,
      subjectCount: subjectResults.length,
    }
  })

  // Rank by average (desc); ties share a position.
  const ranked = [...students].sort((a, b) => b.average - a.average)
  ranked.forEach((s, i) => {
    if (i > 0 && ranked[i - 1].average === s.average) s.position = ranked[i - 1].position
    else s.position = i + 1
  })

  return students.sort((a, b) => a.lastName.localeCompare(b.lastName))
}

/** Build a studentId -> offered subjectIds map from student_subjects rows. */
export function buildOfferedMap(rows: { student_id: string; subject_id: string }[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const r of rows) {
    const set = map.get(r.student_id) ?? new Set<string>()
    set.add(r.subject_id)
    map.set(r.student_id, set)
  }
  return map
}
