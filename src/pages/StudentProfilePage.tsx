import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Pencil } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSchool } from '@/providers/SchoolProvider'
import type { Tables } from '@/types/database'
import { StudentAvatar } from '@/components/StudentAvatar'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FullScreenLoader } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { StudentDialog, type ClassOption } from '@/pages/StudentsPage'
import { UserX } from 'lucide-react'

type Student = Tables<'students'>

function age(dob: string | null) {
  if (!dob) return null
  const d = new Date(dob)
  const diff = Date.now() - d.getTime()
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000))
}

export function StudentProfilePage() {
  const { id } = useParams<{ id: string }>()
  const { activeSchool, activeRole } = useSchool()
  const schoolId = activeSchool?.id
  const qc = useQueryClient()
  const canManage = activeRole === 'owner' || activeRole === 'admin'
  const [editing, setEditing] = useState(false)

  const { data: student, isLoading } = useQuery({
    queryKey: ['student', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('students').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data as Student | null
    },
  })

  const { data: history } = useQuery({
    queryKey: ['enrolment_history', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('enrollments')
        .select('id, session_id, class_arm_id, status, academic_sessions(name, is_current), class_arms(name, class_levels(name))')
        .eq('student_id', id!)
      if (error) throw error
      return (data ?? []).map((r) => {
        const ses = r.academic_sessions as unknown as { name: string; is_current: boolean } | null
        const arm = r.class_arms as unknown as { name: string; class_levels: { name: string } | null } | null
        return {
          id: r.id as string,
          armId: r.class_arm_id as string,
          sessionName: ses?.name ?? '—',
          isCurrent: ses?.is_current ?? false,
          className: arm ? `${arm.class_levels?.name ?? ''} ${arm.name}`.trim() : '—',
        }
      })
    },
  })

  const { data: currentSession } = useQuery({
    queryKey: ['current_session', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('academic_sessions')
        .select('*')
        .eq('school_id', schoolId!)
        .eq('is_current', true)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  const { data: classOptions } = useQuery({
    queryKey: ['class_options', schoolId],
    enabled: !!schoolId && canManage,
    queryFn: async (): Promise<ClassOption[]> => {
      const { data, error } = await supabase
        .from('class_arms')
        .select('id, name, class_levels(name, sort_order)')
        .eq('school_id', schoolId!)
      if (error) throw error
      return (data ?? [])
        .map((a) => {
          const level = a.class_levels as unknown as { name: string; sort_order: number } | null
          return { id: a.id as string, label: `${level?.name ?? '—'} ${a.name}`, sort: (level?.sort_order ?? 0) * 100 }
        })
        .sort((x, y) => x.label.localeCompare(y.label))
    },
  })

  if (isLoading) return <FullScreenLoader />

  if (!student) {
    return (
      <div>
        <BackLink />
        <Card className="mt-4">
          <EmptyState icon={UserX} title="Student not found" description="This student may have been removed." />
        </Card>
      </div>
    )
  }

  const currentEnrolment = history?.find((h) => h.isCurrent)
  const studentAge = age(student.dob)

  return (
    <div>
      <BackLink />

      <Card className="mt-4">
        <CardBody className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
          <StudentAvatar
            photoPath={student.photo_url}
            firstName={student.first_name}
            lastName={student.last_name}
            size={104}
            className="text-3xl"
          />
          <div className="flex-1 text-center sm:text-left">
            <h1 className="font-serif text-2xl font-semibold text-foreground">
              {student.first_name} {student.middle_name ? `${student.middle_name} ` : ''}
              {student.last_name}
            </h1>
            <p className="mt-1 font-mono text-sm text-muted">{student.admission_no ?? 'No admission number'}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-2 sm:justify-start">
              <StatusPill status={student.status} />
              {currentEnrolment && (
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  {currentEnrolment.className}
                </span>
              )}
            </div>
          </div>
          {canManage && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          )}
        </CardBody>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
              <Detail label="Gender" value={student.gender ?? '—'} />
              <Detail label="Date of birth" value={student.dob ?? '—'} />
              <Detail label="Age" value={studentAge != null ? `${studentAge} years` : '—'} />
              <Detail label="Status" value={student.status} />
              <Detail
                label="Current class"
                value={currentEnrolment?.className ?? (currentSession ? 'Not enrolled' : 'No current session')}
              />
              <Detail label="Added" value={new Date(student.created_at).toLocaleDateString()} />
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Enrolment history" description="Class placements across sessions." />
          <CardBody>
            {!history || history.length === 0 ? (
              <p className="text-sm text-muted">No enrolment records yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {history
                  .slice()
                  .sort((a, b) => b.sessionName.localeCompare(a.sessionName))
                  .map((h) => (
                    <li
                      key={h.id}
                      className="flex items-center justify-between rounded-md border border-border px-4 py-2.5 text-sm"
                    >
                      <span className="font-medium text-foreground">{h.sessionName}</span>
                      <span className="flex items-center gap-2 text-muted">
                        {h.className}
                        {h.isCurrent && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            Current
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {editing && schoolId && (
        <StudentDialog
          schoolId={schoolId}
          student={student}
          sessionId={currentSession?.id ?? null}
          currentArmId={currentEnrolment?.armId ?? null}
          classOptions={classOptions ?? []}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            qc.invalidateQueries({ queryKey: ['student', id] })
            qc.invalidateQueries({ queryKey: ['enrolment_history', id] })
            qc.invalidateQueries({ queryKey: ['photo_url'] })
          }}
        />
      )}
    </div>
  )
}

function BackLink() {
  return (
    <Link to="/students" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> Back to students
    </Link>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-faint">{label}</dt>
      <dd className="mt-0.5 font-medium text-foreground">{value}</dd>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'active'
      ? 'bg-success/15 text-success'
      : status === 'graduated'
        ? 'bg-primary/10 text-primary'
        : 'bg-muted-surface text-muted'
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${tone}`}>{status}</span>
}
