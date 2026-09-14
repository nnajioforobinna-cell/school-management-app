import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Pencil, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSchool } from '@/providers/SchoolProvider'
import type { Tables } from '@/types/database'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { FullScreenLoader } from '@/components/ui/spinner'

type Subject = Tables<'subjects'>

export function SubjectsPage() {
  const { activeSchool } = useSchool()
  const schoolId = activeSchool?.id
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Subject | null>(null)
  const [open, setOpen] = useState(false)

  const { data: subjects, isLoading } = useQuery({
    queryKey: ['subjects', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subjects')
        .select('*')
        .eq('school_id', schoolId!)
        .order('name')
      if (error) throw error
      return data as Subject[]
    },
  })

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('subjects').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subjects', schoolId] }),
  })

  const openNew = () => {
    setEditing(null)
    setOpen(true)
  }
  const openEdit = (s: Subject) => {
    setEditing(s)
    setOpen(true)
  }

  if (isLoading) return <FullScreenLoader />

  return (
    <div>
      <PageHeader
        title="Subjects"
        description="The subjects taught in your school. These are selected when recording scores."
        action={
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" /> Add subject
          </Button>
        }
      />

      <Card>
        {!subjects || subjects.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No subjects yet"
            description="Add the subjects your school teaches, e.g. Mathematics, English Language, Basic Science."
            action={
              <Button onClick={openNew}>
                <Plus className="h-4 w-4" /> Add your first subject
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {subjects.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{s.name}</p>
                  <p className="text-xs text-muted">
                    {s.code ? <span className="font-mono">{s.code}</span> : 'No code'}
                    {' · '}
                    {s.is_core ? 'Core' : 'Elective'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(s)} aria-label="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Delete "${s.name}"? This cannot be undone.`)) del.mutate(s.id)
                    }}
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4 text-danger" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {open && schoolId && (
        <SubjectDialog
          schoolId={schoolId}
          subject={editing}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false)
            qc.invalidateQueries({ queryKey: ['subjects', schoolId] })
          }}
        />
      )}
    </div>
  )
}

function SubjectDialog({
  schoolId,
  subject,
  onClose,
  onSaved,
}: {
  schoolId: string
  subject: Subject | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(subject?.name ?? '')
  const [code, setCode] = useState(subject?.code ?? '')
  const [isCore, setIsCore] = useState(subject?.is_core ?? true)
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: async () => {
      const payload = { name: name.trim(), code: code.trim() || null, is_core: isCore }
      if (subject) {
        const { error } = await supabase.from('subjects').update(payload).eq('id', subject.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('subjects').insert({ ...payload, school_id: schoolId })
        if (error) throw error
      }
    },
    onSuccess: onSaved,
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Could not save subject.'),
  })

  return (
    <Dialog
      open
      onClose={onClose}
      title={subject ? 'Edit subject' : 'Add subject'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!name.trim()}>
            {subject ? 'Save' : 'Add subject'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Subject name" htmlFor="s-name">
          <Input id="s-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Mathematics" />
        </Field>
        <Field label="Code" htmlFor="s-code" hint="Optional short code shown on records.">
          <Input id="s-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="MTH" />
        </Field>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={isCore}
            onChange={(e) => setIsCore(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-[var(--primary)]"
          />
          Core subject (taken by all students)
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Dialog>
  )
}
