import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { GraduationCap, Users, Layers, BookOpen, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSchool } from '@/providers/SchoolProvider'
import { formatMoney } from '@/lib/utils'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardBody } from '@/components/ui/card'

type CountTable = 'students' | 'staff' | 'class_arms' | 'subjects'

async function countOf(table: CountTable, schoolId: string) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true }).eq('school_id', schoolId)
  if (error) throw error
  return count ?? 0
}

const SETUP = [
  { label: 'Complete your school profile', to: '/settings' },
  { label: 'Set the current session and term', to: '/settings' },
  { label: 'Add class levels and arms', to: '/classes' },
  { label: 'Create subjects', to: '/subjects' },
  { label: 'Enrol your first students', to: '/students' },
]

export function DashboardPage() {
  const { activeSchool, activeRole } = useSchool()
  const schoolId = activeSchool?.id
  const currency = activeSchool?.currency ?? 'NGN'
  const isAdmin = activeRole === 'owner' || activeRole === 'admin'

  const { data: counts } = useQuery({
    queryKey: ['dashboard_counts', schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const [students, staff, arms, subjects] = await Promise.all([
        countOf('students', schoolId!),
        countOf('staff', schoolId!),
        countOf('class_arms', schoolId!),
        countOf('subjects', schoolId!),
      ])
      return { students, staff, arms, subjects }
    },
  })

  const { data: analytics } = useQuery({
    queryKey: ['dashboard_analytics', schoolId],
    enabled: !!schoolId && isAdmin,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10)
      const [{ data: session }, { data: att }, { data: students }] = await Promise.all([
        supabase.from('academic_sessions').select('id').eq('school_id', schoolId!).eq('is_current', true).maybeSingle(),
        supabase.from('attendance').select('status').eq('school_id', schoolId!).gte('date', since),
        supabase.from('students').select('gender').eq('school_id', schoolId!),
      ])

      let billed = 0
      let collected = 0
      if (session) {
        const { data: inv } = await supabase.from('invoices').select('total, amount_paid').eq('school_id', schoolId!).eq('session_id', session.id)
        for (const i of inv ?? []) {
          billed += Number(i.total)
          collected += Number(i.amount_paid)
        }
      }

      const attTotal = (att ?? []).length
      const present = (att ?? []).filter((a) => a.status === 'present' || a.status === 'late').length
      const male = (students ?? []).filter((s) => s.gender === 'Male').length
      const female = (students ?? []).filter((s) => s.gender === 'Female').length

      return {
        billed,
        collected,
        outstanding: Math.max(0, billed - collected),
        collectionRate: billed > 0 ? Math.round((collected / billed) * 100) : 0,
        attendanceRate: attTotal > 0 ? Math.round((present / attTotal) * 100) : null,
        attTotal,
        male,
        female,
      }
    },
  })

  const fmt = (n: number | undefined) => (n == null ? '—' : String(n))
  const stats = [
    { label: 'Students', value: fmt(counts?.students), icon: GraduationCap, to: '/students' },
    { label: 'Staff', value: fmt(counts?.staff), icon: Users, to: '/staff' },
    { label: 'Class arms', value: fmt(counts?.arms), icon: Layers, to: '/classes' },
    { label: 'Subjects', value: fmt(counts?.subjects), icon: BookOpen, to: '/subjects' },
  ]

  return (
    <div>
      <PageHeader
        title={`Welcome${activeSchool ? ` to ${activeSchool.name}` : ''}`}
        description={isAdmin ? 'Your school at a glance.' : 'Your overview.'}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} to={s.to}>
            <Card className="transition-colors hover:border-border-strong">
              <CardBody className="flex flex-col gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <s.icon className="h-[18px] w-[18px]" />
                </div>
                <div>
                  <p className="font-serif text-2xl font-semibold tabular-nums text-foreground">{s.value}</p>
                  <p className="text-sm text-muted">{s.label}</p>
                </div>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>

      {isAdmin && analytics && (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Fees */}
          <Card>
            <CardBody>
              <p className="text-sm font-medium text-foreground">Fee collection</p>
              <p className="mt-1 font-serif text-2xl font-semibold tabular-nums text-foreground">
                {formatMoney(analytics.collected, currency)}
              </p>
              <p className="text-xs text-muted">of {formatMoney(analytics.billed, currency)} billed this session</p>
              <Meter value={analytics.collectionRate} tone="var(--success)" />
              <div className="mt-2 flex justify-between text-xs">
                <span className="text-success">{analytics.collectionRate}% collected</span>
                <Link to="/fees" className="text-danger hover:underline">
                  {formatMoney(analytics.outstanding, currency)} outstanding
                </Link>
              </div>
            </CardBody>
          </Card>

          {/* Attendance */}
          <Card>
            <CardBody>
              <p className="text-sm font-medium text-foreground">Attendance rate</p>
              <p className="mt-1 font-serif text-2xl font-semibold tabular-nums text-foreground">
                {analytics.attendanceRate == null ? '—' : `${analytics.attendanceRate}%`}
              </p>
              <p className="text-xs text-muted">last 30 days · {analytics.attTotal} records</p>
              <Meter value={analytics.attendanceRate ?? 0} tone="var(--primary)" />
            </CardBody>
          </Card>

          {/* Gender split */}
          <Card>
            <CardBody>
              <p className="text-sm font-medium text-foreground">Student gender</p>
              <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-muted-surface">
                {analytics.male + analytics.female > 0 ? (
                  <>
                    <div style={{ width: `${(analytics.male / (analytics.male + analytics.female)) * 100}%`, background: 'var(--primary)' }} />
                    <div style={{ width: `${(analytics.female / (analytics.male + analytics.female)) * 100}%`, background: 'var(--accent-gold)' }} />
                  </>
                ) : null}
              </div>
              <div className="mt-3 flex justify-between text-sm">
                <span className="flex items-center gap-1.5"><Dot color="var(--primary)" /> Male <b className="tabular-nums">{analytics.male}</b></span>
                <span className="flex items-center gap-1.5"><Dot color="var(--accent-gold)" /> Female <b className="tabular-nums">{analytics.female}</b></span>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {isAdmin && (
        <div className="mt-6">
          <Card>
            <CardBody>
              <h2 className="font-serif text-lg font-semibold text-foreground">Get set up</h2>
              <p className="mt-0.5 text-sm text-muted">A few steps to get your school running.</p>
              <ul className="mt-4 flex flex-col divide-y divide-border">
                {SETUP.map((step) => (
                  <li key={step.label}>
                    <Link to={step.to} className="flex items-center justify-between py-3 text-sm text-foreground hover:text-primary">
                      {step.label}
                      <ArrowRight className="h-4 w-4 text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  )
}

function Meter({ value, tone }: { value: number; tone: string }) {
  return (
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted-surface">
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, value)}%`, background: tone }} />
    </div>
  )
}

function Dot({ color }: { color: string }) {
  return <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
}
