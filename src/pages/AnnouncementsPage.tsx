import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Megaphone, Send, MessageSquare, Smartphone } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/AuthProvider'
import { useSchool } from '@/providers/SchoolProvider'
import type { AppRole, Tables } from '@/types/database'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Field } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'

type Announcement = Tables<'announcements'>

const AUDIENCES: { id: string; label: string; roles: AppRole[] }[] = [
  { id: 'everyone', label: 'Everyone', roles: ['owner', 'admin', 'bursar', 'teacher', 'parent', 'student'] },
  { id: 'staff', label: 'All staff', roles: ['owner', 'admin', 'bursar', 'teacher'] },
  { id: 'teachers', label: 'Teachers', roles: ['teacher'] },
  { id: 'parents', label: 'Parents', roles: ['parent'] },
]

export function AnnouncementsPage() {
  const { user } = useAuth()
  const { activeSchool } = useSchool()
  const schoolId = activeSchool!.id
  const qc = useQueryClient()

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState('everyone')
  const [sms, setSms] = useState(false)
  const [whatsapp, setWhatsapp] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: past } = useQuery({
    queryKey: ['announcements', schoolId],
    queryFn: async () => {
      const { data } = await supabase
        .from('announcements')
        .select('*')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false })
        .limit(30)
      return (data ?? []) as Announcement[]
    },
  })

  const send = useMutation({
    mutationFn: async () => {
      setResult(null)
      const aud = AUDIENCES.find((a) => a.id === audience)!
      const channels = ['in_app', ...(sms ? ['sms'] : []), ...(whatsapp ? ['whatsapp'] : [])]

      const { data: ann, error } = await supabase
        .from('announcements')
        .insert({
          school_id: schoolId,
          title: title.trim(),
          body: body.trim() || null,
          audience: { audience, roles: aud.roles },
          channels,
          published_at: new Date().toISOString(),
          created_by: user?.id ?? null,
        })
        .select('id')
        .single()
      if (error) throw error

      // In-app fan-out: notify every targeted member.
      const { data: members } = await supabase
        .from('user_school_roles')
        .select('user_id, role')
        .eq('school_id', schoolId)
        .eq('status', 'active')
        .in('role', aud.roles)
      const userIds = [...new Set((members ?? []).map((m) => m.user_id as string))]
      if (userIds.length) {
        const notifs = userIds.map((uid) => ({ school_id: schoolId, user_id: uid, title: title.trim(), body: body.trim() || null }))
        await supabase.from('notifications').insert(notifs)
      }

      let extra = `Delivered in-app to ${userIds.length} ${userIds.length === 1 ? 'person' : 'people'}.`

      // SMS / WhatsApp via Edge Function (Termii).
      if (sms || whatsapp) {
        const { data: res, error: fnErr } = await supabase.functions.invoke('send-announcement', {
          body: { school_id: schoolId, announcement_id: ann.id, roles: aud.roles, channels },
        })
        if (fnErr) {
          extra += ' SMS/WhatsApp could not be sent.'
        } else if (res?.configured === false) {
          extra += ' SMS/WhatsApp is not configured yet (add a Termii API key).'
        } else if (res) {
          extra += ` Sent ${res.sent ?? 0} message(s).`
        }
      }
      setResult(extra)
    },
    onSuccess: () => {
      setTitle('')
      setBody('')
      setSms(false)
      setWhatsapp(false)
      qc.invalidateQueries({ queryKey: ['announcements', schoolId] })
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Could not send announcement.'),
  })

  return (
    <div>
      <PageHeader title="Announcements" description="Send news and reminders to your school. In-app delivery is instant; SMS and WhatsApp reach parents directly." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="New announcement" />
          <CardBody className="flex flex-col gap-4">
            <Field label="Title" htmlFor="a-title">
              <Input id="a-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Mid-term break" />
            </Field>
            <Field label="Message" htmlFor="a-body">
              <textarea
                id="a-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                placeholder="Write your announcement…"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </Field>
            <Field label="Send to" htmlFor="a-aud">
              <Select id="a-aud" value={audience} onChange={(e) => setAudience(e.target.value)}>
                {AUDIENCES.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </Select>
            </Field>
            <div>
              <p className="mb-2 text-sm font-medium text-foreground">Channels</p>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm text-primary">
                  <MessageSquare className="h-3.5 w-3.5" /> In-app
                </span>
                <ChannelToggle icon={Smartphone} label="SMS" on={sms} onToggle={() => setSms((v) => !v)} />
                <ChannelToggle icon={MessageSquare} label="WhatsApp" on={whatsapp} onToggle={() => setWhatsapp((v) => !v)} />
              </div>
            </div>

            {result && <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">{result}</p>}
            {error && <p className="text-sm text-danger">{error}</p>}

            <Button onClick={() => send.mutate()} loading={send.isPending} disabled={!title.trim()} className="self-start">
              <Send className="h-4 w-4" /> Send announcement
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Recent announcements" />
          {!past || past.length === 0 ? (
            <EmptyState icon={Megaphone} title="Nothing sent yet" description="Your announcements will appear here." />
          ) : (
            <ul className="divide-y divide-border">
              {past.map((a) => (
                <li key={a.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-foreground">{a.title}</p>
                    <span className="shrink-0 text-xs text-faint">
                      {a.created_at ? new Date(a.created_at).toLocaleDateString() : ''}
                    </span>
                  </div>
                  {a.body && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{a.body}</p>}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {(a.channels ?? []).map((c) => (
                      <span key={c} className="rounded-full bg-muted-surface px-2 py-0.5 text-[11px] text-muted">
                        {c === 'in_app' ? 'In-app' : c === 'sms' ? 'SMS' : 'WhatsApp'}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

function ChannelToggle({
  icon: Icon,
  label,
  on,
  onToggle,
}: {
  icon: typeof MessageSquare
  label: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors',
        on ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-surface text-muted hover:bg-muted-surface',
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  )
}
