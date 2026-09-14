import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardList, Plus, Trash2, CalendarClock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/AuthProvider'
import { useSchool } from '@/providers/SchoolProvider'
import type { Tables } from '@/types/database'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Field } from '@/components/ui/field'
import { DatePicker } from '@/components/ui/date-picker'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'

type Assignment = Tables<'assignments'>

export function AssignmentsPage() {
  const { activeSchool, activeRole } = useSchool()
  const schoolId = activeSchool!.id
  const qc = useQueryClient()
  const canManage = activeRole === 'owner' || activeRole === 'admin' || activeRole === 'teacher'
  const [open, setOpen] = useState(false)
  const [filterArm, setFilterArm] = useState('')

  const { data: arms } = useQuery({
    queryKey: ['class_options', schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from('class_arms')
        .select('id, name, class_levels(name, sort_order)')
        .eq('school_id', schoolId)
      return (data ?? []).map((a) => {
        const l = a.class_levels as unknown as { name: string; sort_order: number } | null
        return { id: a.id as string, label: `${l?.name ?? '—'} ${a.name}` }
      }).sort((x, y) => x.label.localeCompare(y.label))
    },
  })
  const { data: subjects } = useQuery({
    queryKey: ['subjects', schoolId],
    queryFn: async () => {
      const { data } = await supabase.from('subjects').select('id, name').eq('school_id', schoolId).order('name')
      return (data ?? []) as { id: string; name: string }[]
    },
  })
  const { data: assignments } = useQuery({
    queryKey: ['assignments', schoolId, filterArm],
    queryFn: async () => {
      let q = supabase.from('assignments').select('*').eq('school_id', schoolId).order('created_at', { ascending: false })
      if (filterArm) q = q.eq('class_arm_id', filterArm)
      const { data } = await q
      return (data ?? []) as Assignment[]
    },
  })

  const armLabel = (id: string) => arms?.find((a) => a.id === id)?.label ?? '—'
  const subjectName = (id: string | null) => subjects?.find((s) => s.id === id)?.name ?? null

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('assignments').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments', schoolId] }),
  })

  return (
    <div>
      <PageHeader
        title="Assignments"
        description="Post assignments and homework for classes."
        action={canManage ? <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New assignment</Button> : undefined}
      />

      <div className="mb-4 max-w-xs">
        <Select value={filterArm} onChange={(e) => setFilterArm(e.target.value)}>
          <option value="">All classes</option>
          {(arms ?? []).map((a) => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </Select>
      </div>

      {!assignments || assignments.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="No assignments yet"
            description="Post homework and projects for your classes."
            action={canManage ? <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New assignment</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="grid gap-3">
          {assignments.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-foreground">{a.title}</h3>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{armLabel(a.class_arm_id)}</span>
                    {subjectName(a.subject_id) && (
                      <span className="rounded-full bg-muted-surface px-2 py-0.5 text-xs text-muted">{subjectName(a.subject_id)}</span>
                    )}
                  </div>
                  {a.description && <p className="mt-1.5 text-sm text-muted">{a.description}</p>}
                  {a.due_date && (
                    <p className="mt-2 inline-flex items-center gap-1 text-xs text-faint">
                      <CalendarClock className="h-3.5 w-3.5" /> Due {new Date(a.due_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
                {canManage && (
                  <Button variant="ghost" size="sm" onClick={() => confirm(`Delete "${a.title}"?`) && del.mutate(a.id)} aria-label="Delete">
                    <Trash2 className="h-4 w-4 text-danger" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {open && (
        <AssignmentDialog
          schoolId={schoolId}
          arms={arms ?? []}
          subjects={subjects ?? []}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false)
            qc.invalidateQueries({ queryKey: ['assignments', schoolId] })
          }}
        />
      )}
    </div>
  )
}

function AssignmentDialog({
  schoolId,
  arms,
  subjects,
  onClose,
  onSaved,
}: {
  schoolId: string
  arms: { id: string; label: string }[]
  subjects: { id: string; name: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const { user } = useAuth()
  const [armId, setArmId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: async () => {
      if (!armId) throw new Error('Select a class.')
      const { error } = await supabase.from('assignments').insert({
        school_id: schoolId,
        class_arm_id: armId,
        subject_id: subjectId || null,
        title: title.trim(),
        description: description.trim() || null,
        due_date: dueDate || null,
        created_by: user?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: onSaved,
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Could not post assignment.'),
  })

  return (
    <Dialog
      open
      onClose={onClose}
      title="New assignment"
      className="max-w-lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!title.trim() || !armId}>Post</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Class" htmlFor="as-arm">
            <Select id="as-arm" value={armId} onChange={(e) => setArmId(e.target.value)}>
              <option value="">Select…</option>
              {arms.map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Subject" htmlFor="as-subj" hint="Optional">
            <Select id="as-subj" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">—</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Title" htmlFor="as-title">
          <Input id="as-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Essay: My hero" />
        </Field>
        <Field label="Description" htmlFor="as-desc">
          <textarea
            id="as-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Instructions…"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </Field>
        <Field label="Due date" htmlFor="as-due">
          <DatePicker value={dueDate} onChange={setDueDate} />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Dialog>
  )
}
