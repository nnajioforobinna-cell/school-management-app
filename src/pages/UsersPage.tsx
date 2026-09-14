import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UserCog, UserPlus, Trash2, Check, Copy, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSchool } from '@/providers/SchoolProvider'
import type { AppRole } from '@/types/database'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Field } from '@/components/ui/field'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { FullScreenLoader } from '@/components/ui/spinner'

interface Member {
  id: string
  userId: string
  role: AppRole
  status: string
  name: string
}

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  admin: 'Administrator',
  bursar: 'Bursar',
  teacher: 'Teacher',
  prefect: 'Prefect (attendance)',
  parent: 'Parent',
  student: 'Student',
}

// Roles an admin can grant here.
const GRANTABLE: { value: AppRole; label: string; hint: string }[] = [
  { value: 'teacher', label: 'Teacher', hint: 'Records C.A. & Exam scores (Gradebook).' },
  { value: 'prefect', label: 'Prefect / Monitor', hint: 'Marks the Attendance register only.' },
  { value: 'bursar', label: 'Bursar', hint: 'Manages fees and payments.' },
  { value: 'admin', label: 'Administrator', hint: 'Full access to the school.' },
]

interface InviteResult {
  user_id: string
  email: string
  role: string
  created: boolean
  temp_password: string | null
}

export function UsersPage() {
  const { activeSchool } = useSchool()
  const schoolId = activeSchool!.id
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)

  const { data: members, isLoading } = useQuery({
    queryKey: ['members_list', schoolId],
    queryFn: async (): Promise<Member[]> => {
      const { data: roles } = await supabase
        .from('user_school_roles')
        .select('id, role, status, user_id')
        .eq('school_id', schoolId)
      const rows = roles ?? []
      const ids = [...new Set(rows.map((r) => r.user_id as string))]
      const nameMap = new Map<string, string>()
      if (ids.length) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids)
        for (const p of profs ?? []) nameMap.set(p.id as string, (p.full_name as string) || '')
      }
      return rows
        .map((r) => ({
          id: r.id as string,
          userId: r.user_id as string,
          role: r.role as AppRole,
          status: r.status as string,
          name: nameMap.get(r.user_id as string) || '—',
        }))
        .sort((a, b) => a.role.localeCompare(b.role))
    },
  })

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('user_school_roles').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members_list', schoolId] }),
  })

  if (isLoading) return <FullScreenLoader />

  return (
    <div>
      <PageHeader
        title="Users & Access"
        description="Give people login access and choose exactly what they can do — teachers record scores, prefects mark attendance."
        action={
          <Button onClick={() => setOpen(true)}>
            <UserPlus className="h-4 w-4" /> Invite user
          </Button>
        }
      />

      <Card>
        {!members || members.length === 0 ? (
          <EmptyState icon={UserCog} title="No users yet" description="Invite teachers, prefects, or admins to give them access." />
        ) : (
          <ul className="divide-y divide-border">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                    {m.name !== '—' ? m.name.split(' ').map((w) => w.charAt(0)).slice(0, 2).join('').toUpperCase() : <ShieldCheck className="h-4 w-4" />}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{m.name}</p>
                    <p className="text-xs text-muted">{m.userId === activeSchool?.created_by ? 'School creator' : m.status}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-muted-surface px-2.5 py-0.5 text-xs font-medium text-foreground">
                    {ROLE_LABEL[m.role] ?? m.role}
                  </span>
                  {m.role !== 'owner' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => confirm(`Remove ${ROLE_LABEL[m.role]} access for ${m.name}?`) && revoke.mutate(m.id)}
                      aria-label="Revoke access"
                    >
                      <Trash2 className="h-4 w-4 text-danger" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {open && (
        <InviteDialog
          schoolId={schoolId}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false)
            qc.invalidateQueries({ queryKey: ['members_list', schoolId] })
          }}
        />
      )}
    </div>
  )
}

function InviteDialog({ schoolId, onClose, onSaved }: { schoolId: string; onClose: () => void; onSaved: () => void }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AppRole>('teacher')
  const [error, setError] = useState<string | null>(null)
  const [credentials, setCredentials] = useState<InviteResult | null>(null)
  const [copied, setCopied] = useState(false)

  const invite = useMutation({
    mutationFn: async (): Promise<InviteResult> => {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: { school_id: schoolId, email: email.trim(), role, full_name: fullName.trim() },
      })
      if (error) {
        let msg = error.message
        try {
          const ctx = (error as { context?: Response }).context
          const body = ctx ? await ctx.json() : null
          if (body?.error) msg = body.error
        } catch {
          /* keep default */
        }
        throw new Error(msg)
      }
      return data as InviteResult
    },
    onSuccess: (res) => {
      if (res.temp_password) setCredentials(res)
      else onSaved()
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Could not invite user.'),
  })

  if (credentials) {
    return (
      <Dialog open onClose={onSaved} title="Access granted" footer={<Button onClick={onSaved}>Done</Button>}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Share these details with the user. They sign in and can change the password afterwards. It won't be shown again.
          </p>
          <div className="rounded-md border border-border bg-muted-surface p-4 text-sm">
            <div className="mb-2">
              <span className="text-xs uppercase tracking-wider text-faint">Email</span>
              <p className="font-mono text-foreground">{credentials.email}</p>
            </div>
            <div>
              <span className="text-xs uppercase tracking-wider text-faint">Temporary password</span>
              <p className="font-mono text-foreground">{credentials.temp_password}</p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              navigator.clipboard
                ?.writeText(`Email: ${credentials.email}\nPassword: ${credentials.temp_password}`)
                .then(() => {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                })
            }}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy credentials'}
          </Button>
        </div>
      </Dialog>
    )
  }

  const selected = GRANTABLE.find((g) => g.value === role)

  return (
    <Dialog
      open
      onClose={onClose}
      title="Invite user"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => invite.mutate()} loading={invite.isPending} disabled={!fullName.trim() || !email.trim()}>
            Grant access
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Full name" htmlFor="u-name">
          <Input id="u-name" autoFocus value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Mr John Bello" />
        </Field>
        <Field label="Email" htmlFor="u-email" hint="Used to sign in.">
          <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </Field>
        <Field label="Role" htmlFor="u-role" hint={selected?.hint}>
          <Select id="u-role" value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
            {GRANTABLE.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </Select>
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Dialog>
  )
}
