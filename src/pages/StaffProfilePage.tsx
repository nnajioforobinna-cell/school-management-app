import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Pencil, KeyRound, UserX } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSchool } from '@/providers/SchoolProvider'
import type { Tables } from '@/types/database'
import { STAFF_PHOTOS } from '@/lib/storage'
import { docHeaderHtml, printHtml, tableHtml, type Column } from '@/lib/print'
import { exportSheet } from '@/lib/excel'
import { ExportButtons } from '@/components/ExportButtons'
import { formatDate } from '@/lib/utils'
import { Avatar } from '@/components/StudentAvatar'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FullScreenLoader } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { StaffDialog } from '@/pages/StaffPage'

type Staff = Tables<'staff'>

export function StaffProfilePage() {
  const { id } = useParams<{ id: string }>()
  const { activeSchool, activeRole } = useSchool()
  const qc = useQueryClient()
  const canManage = activeRole === 'owner' || activeRole === 'admin'
  const [editing, setEditing] = useState(false)

  const { data: staff, isLoading } = useQuery({
    queryKey: ['staff_one', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('staff').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data as Staff | null
    },
  })

  const { data: subjects } = useQuery({
    queryKey: ['staff_subject_names', id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase.from('staff_subjects').select('subjects(name)').eq('staff_id', id!)
      return (data ?? [])
        .map((r) => (r.subjects as unknown as { name: string } | null)?.name)
        .filter(Boolean) as string[]
    },
  })

  if (isLoading) return <FullScreenLoader />

  if (!staff) {
    return (
      <div>
        <Back />
        <Card className="mt-4">
          <EmptyState icon={UserX} title="Staff not found" description="This staff member may have been removed." />
        </Card>
      </div>
    )
  }

  const fullName = `${staff.title ? staff.title + ' ' : ''}${staff.first_name} ${staff.last_name}`

  const profileCols: Column[] = [
    { key: 'field', label: 'Field' },
    { key: 'value', label: 'Value' },
  ]
  const profileRows = () => [
    { field: 'Staff No.', value: staff.staff_no ?? '—' },
    { field: 'Name', value: fullName },
    { field: 'Qualification', value: staff.qualification ?? '—' },
    { field: 'Subjects taught', value: (subjects ?? []).join(', ') || '—' },
    { field: 'Department', value: staff.department ?? '—' },
    { field: 'Date of employment', value: staff.employment_date ? formatDate(staff.employment_date) : '—' },
    { field: 'Email', value: staff.email ?? '—' },
    { field: 'Phone', value: staff.phone ?? '—' },
    { field: 'Employment status', value: staff.employment_status },
    { field: 'Login access', value: staff.user_id ? 'Active' : 'None' },
  ]
  const exportPdf = () => {
    const header = docHeaderHtml({
      name: activeSchool?.name ?? 'School',
      address: activeSchool?.address,
      logoUrl: activeSchool?.logo_url,
      title: 'Staff Profile',
      subtitle: fullName,
    })
    printHtml('Staff Profile', header + tableHtml(profileCols, profileRows()))
  }
  const exportXlsx = () => exportSheet(`Staff - ${fullName}`, profileCols, profileRows(), 'Profile', 'Staff Profile')

  return (
    <div>
      <Back />

      <Card className="mt-4">
        <CardBody className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
          <Avatar photoPath={staff.photo_url} firstName={staff.first_name} lastName={staff.last_name} size={104} bucket={STAFF_PHOTOS} className="text-3xl" />
          <div className="flex-1 text-center sm:text-left">
            <h1 className="font-serif text-2xl font-semibold text-foreground">{fullName}</h1>
            <p className="mt-1 font-mono text-sm text-muted">{staff.staff_no ?? 'No staff number'}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-2 sm:justify-start">
              {staff.department && <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">{staff.department}</span>}
              {staff.user_id ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success">
                  <KeyRound className="h-3 w-3" /> Has login
                </span>
              ) : (
                <span className="rounded-full bg-muted-surface px-2.5 py-0.5 text-xs text-muted">No login</span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <ExportButtons onPdf={exportPdf} onExcel={exportXlsx} size="sm" />
            {canManage && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Details" />
        <CardBody>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
            <Detail label="Qualification" value={staff.qualification ?? '—'} className="col-span-2" />
            <Detail label="Department" value={staff.department ?? '—'} />
            <Detail label="Employed" value={staff.employment_date ? formatDate(staff.employment_date) : '—'} />
            <Detail label="Status" value={staff.employment_status} />
            <Detail label="Email" value={staff.email ?? '—'} />
            <Detail label="Phone" value={staff.phone ?? '—'} />
          </dl>
          {subjects && subjects.length > 0 && (
            <div className="mt-4">
              <p className="text-xs uppercase tracking-wider text-faint">Subjects taught</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {subjects.map((s) => (
                  <span key={s} className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">{s}</span>
                ))}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {editing && activeSchool && (
        <StaffDialog
          schoolId={activeSchool.id}
          staff={staff}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            qc.invalidateQueries({ queryKey: ['staff_one', id] })
            qc.invalidateQueries({ queryKey: ['photo_url'] })
          }}
        />
      )}
    </div>
  )
}

function Back() {
  return (
    <Link to="/staff" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> Back to staff
    </Link>
  )
}

function Detail({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs uppercase tracking-wider text-faint">{label}</dt>
      <dd className="mt-0.5 font-medium text-foreground">{value}</dd>
    </div>
  )
}
