import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Layers, Pencil, Plus, Trash2, X } from 'lucide-react'
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

type Level = Tables<'class_levels'>
type Arm = Tables<'class_arms'>

export function ClassesPage() {
  const { activeSchool } = useSchool()
  const schoolId = activeSchool?.id
  const qc = useQueryClient()
  const [levelDialog, setLevelDialog] = useState<{ open: boolean; level: Level | null }>({
    open: false,
    level: null,
  })
  const [armFor, setArmFor] = useState<Level | null>(null)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['class_levels', schoolId] })
    qc.invalidateQueries({ queryKey: ['class_arms', schoolId] })
  }

  const { data: levels, isLoading } = useQuery({
    queryKey: ['class_levels', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('class_levels')
        .select('*')
        .eq('school_id', schoolId!)
        .order('sort_order')
        .order('name')
      if (error) throw error
      return data as Level[]
    },
  })

  const { data: arms } = useQuery({
    queryKey: ['class_arms', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('class_arms')
        .select('*')
        .eq('school_id', schoolId!)
        .order('name')
      if (error) throw error
      return data as Arm[]
    },
  })

  const delLevel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('class_levels').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const delArm = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('class_arms').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  if (isLoading) return <FullScreenLoader />

  const armsFor = (levelId: string) => (arms ?? []).filter((a) => a.class_level_id === levelId)

  return (
    <div>
      <PageHeader
        title="Classes"
        description="Your class levels (e.g. JSS1) and their arms (e.g. A, B). Students are enrolled into an arm."
        action={
          <Button onClick={() => setLevelDialog({ open: true, level: null })}>
            <Plus className="h-4 w-4" /> Add class level
          </Button>
        }
      />

      {!levels || levels.length === 0 ? (
        <Card>
          <EmptyState
            icon={Layers}
            title="No classes yet"
            description="Start by adding a class level such as JSS1 or Primary 1, then add its arms."
            action={
              <Button onClick={() => setLevelDialog({ open: true, level: null })}>
                <Plus className="h-4 w-4" /> Add your first class level
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {levels.map((level) => (
            <Card key={level.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-serif text-lg font-semibold text-foreground">{level.name}</h3>
                  <p className="text-xs text-muted">
                    {armsFor(level.id).length} arm{armsFor(level.id).length === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLevelDialog({ open: true, level })}
                    aria-label="Edit level"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Delete "${level.name}" and all its arms? This cannot be undone.`))
                        delLevel.mutate(level.id)
                    }}
                    aria-label="Delete level"
                  >
                    <Trash2 className="h-4 w-4 text-danger" />
                  </Button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {armsFor(level.id).map((arm) => (
                  <span
                    key={arm.id}
                    className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-muted-surface py-1 pl-3 pr-1.5 text-sm"
                  >
                    <span className="font-medium text-foreground">{arm.name}</span>
                    {arm.capacity != null && (
                      <span className="text-xs text-muted">· {arm.capacity}</span>
                    )}
                    <button
                      onClick={() => {
                        if (confirm(`Remove arm "${arm.name}"?`)) delArm.mutate(arm.id)
                      }}
                      className="rounded-full p-0.5 text-muted hover:bg-danger/10 hover:text-danger"
                      aria-label={`Remove arm ${arm.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
                <Button variant="outline" size="sm" onClick={() => setArmFor(level)}>
                  <Plus className="h-3.5 w-3.5" /> Add arm
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {levelDialog.open && schoolId && (
        <LevelDialog
          schoolId={schoolId}
          level={levelDialog.level}
          nextOrder={(levels?.length ?? 0)}
          onClose={() => setLevelDialog({ open: false, level: null })}
          onSaved={() => {
            setLevelDialog({ open: false, level: null })
            invalidate()
          }}
        />
      )}

      {armFor && schoolId && (
        <ArmDialog
          schoolId={schoolId}
          level={armFor}
          onClose={() => setArmFor(null)}
          onSaved={() => {
            setArmFor(null)
            invalidate()
          }}
        />
      )}
    </div>
  )
}

function LevelDialog({
  schoolId,
  level,
  nextOrder,
  onClose,
  onSaved,
}: {
  schoolId: string
  level: Level | null
  nextOrder: number
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(level?.name ?? '')
  const [order, setOrder] = useState(String(level?.sort_order ?? nextOrder))
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: async () => {
      const payload = { name: name.trim(), sort_order: Number(order) || 0 }
      if (level) {
        const { error } = await supabase.from('class_levels').update(payload).eq('id', level.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('class_levels').insert({ ...payload, school_id: schoolId })
        if (error) throw error
      }
    },
    onSuccess: onSaved,
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Could not save class level.'),
  })

  return (
    <Dialog
      open
      onClose={onClose}
      title={level ? 'Edit class level' : 'Add class level'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!name.trim()}>
            {level ? 'Save' : 'Add level'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Level name" htmlFor="l-name">
          <Input id="l-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="JSS1" />
        </Field>
        <Field label="Sort order" htmlFor="l-order" hint="Controls the order levels appear in (0 = first).">
          <Input id="l-order" type="number" value={order} onChange={(e) => setOrder(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Dialog>
  )
}

function ArmDialog({
  schoolId,
  level,
  onClose,
  onSaved,
}: {
  schoolId: string
  level: Level
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState('')
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('class_arms').insert({
        school_id: schoolId,
        class_level_id: level.id,
        name: name.trim(),
        capacity: capacity ? Number(capacity) : null,
      })
      if (error) throw error
    },
    onSuccess: onSaved,
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Could not add arm.'),
  })

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Add arm to ${level.name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!name.trim()}>
            Add arm
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Arm name" htmlFor="a-name">
          <Input id="a-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="A" />
        </Field>
        <Field label="Capacity" htmlFor="a-cap" hint="Optional maximum number of students.">
          <Input id="a-cap" type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="40" />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Dialog>
  )
}
