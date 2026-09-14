import { CA_NAME, EXAM_NAME, gradeFor } from '@/lib/grading'

export interface RawEnrollment {
  student_id: string
  students: { first_name: string; last_name: string; middle_name: string | null; admission_no: string | null; gender: string | null; photo_url: string | null } | null
}
export interface RawAssessment {
  id: string
  name: string
  subject_id: string
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

interface SubjectMeta {
  id: string
  name: string
  caId?: string
  examId?: string
}

/** Aggregate a class's raw scores into per-student subject results, totals, and positions. */
export function computeClassResults(
  enrollments: RawEnrollment[],
  assessments: RawAssessment[],
  scores: RawScore[],
): StudentResult[] {
  // Group assessments into subjects with their CA/Exam ids.
  const subjectMap = new Map<string, SubjectMeta>()
  for (const a of assessments) {
    const meta = subjectMap.get(a.subject_id) ?? { id: a.subject_id, name: a.subjects?.name ?? '—' }
    if (a.name === CA_NAME) meta.caId = a.id
    else if (a.name === EXAM_NAME) meta.examId = a.id
    subjectMap.set(a.subject_id, meta)
  }
  const subjects = [...subjectMap.values()].sort((a, b) => a.name.localeCompare(b.name))

  const scoreMap = new Map<string, number>()
  for (const s of scores) {
    if (s.score != null) scoreMap.set(`${s.assessment_id}:${s.student_id}`, s.score)
  }

  const students: StudentResult[] = enrollments.map((e) => {
    const subjectResults: SubjectResult[] = subjects.map((sub) => {
      const ca = sub.caId ? (scoreMap.get(`${sub.caId}:${e.student_id}`) ?? null) : null
      const exam = sub.examId ? (scoreMap.get(`${sub.examId}:${e.student_id}`) ?? null) : null
      const hasAny = ca != null || exam != null
      const total = hasAny ? (ca ?? 0) + (exam ?? 0) : null
      const band = total != null ? gradeFor(total) : null
      return {
        subjectId: sub.id,
        name: sub.name,
        ca,
        exam,
        total,
        grade: band?.grade ?? null,
        remark: band?.remark ?? null,
      }
    })
    const total = subjectResults.reduce((sum, s) => sum + (s.total ?? 0), 0)
    const count = subjects.length
    const average = count > 0 ? Math.round((total / count) * 10) / 10 : 0
    return {
      studentId: e.student_id,
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
      subjectCount: count,
    }
  })

  // Rank by total (desc); ties share a position.
  const ranked = [...students].sort((a, b) => b.total - a.total)
  ranked.forEach((s, i) => {
    if (i > 0 && ranked[i - 1].total === s.total) s.position = ranked[i - 1].position
    else s.position = i + 1
  })

  return students.sort((a, b) => a.lastName.localeCompare(b.lastName))
}
