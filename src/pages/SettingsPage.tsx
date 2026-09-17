import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Check, ImageUp, Receipt, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSchool } from '@/providers/SchoolProvider'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Field } from '@/components/ui/field'
import { cn } from '@/lib/utils'
import { AcademicsTab } from '@/pages/settings/AcademicsTab'

const TABS = [
  { id: 'profile', label: 'School profile' },
  { id: 'branding', label: 'Branding' },
  { id: 'academics', label: 'Academics' },
  { id: 'fees', label: 'Fees' },
  { id: 'communication', label: 'Communication' },
  { id: 'security', label: 'Security' },
  { id: 'subscription', label: 'Subscription' },
] as const
type TabId = (typeof TABS)[number]['id']

const profileSchema = z.object({
  name: z.string().min(2, 'School name is required'),
  motto: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  website: z.string().optional(),
})
type ProfileForm = z.infer<typeof profileSchema>

/**
 * Resize an image file in the browser and return it as a small PNG data URL.
 * We store the logo directly on the school row (no Storage bucket), so it works
 * regardless of storage policies and renders everywhere (sidebar, report cards).
 */
function fileToLogoDataUrl(file: File, max = 240): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('Could not process the image.'))
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read that image. Try a PNG or JPG.'))
    }
    img.src = url
  })
}

export function SettingsPage() {
  const [tab, setTab] = useState<TabId>('profile')

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Set up your school's details, branding, and how the platform behaves."
      />

      <div className="flex flex-col gap-6 md:flex-row">
        <nav className="flex gap-1 overflow-x-auto md:w-48 md:flex-col md:overflow-visible">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'whitespace-nowrap rounded-md px-3 py-2 text-left text-sm font-medium transition-colors',
                tab === t.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted hover:bg-muted-surface hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          {tab === 'profile' && <ProfileTab />}
          {tab === 'branding' && <BrandingTab />}
          {tab === 'academics' && <AcademicsTab />}
          {tab === 'fees' && <FeesSettingsTab />}
          {tab !== 'profile' && tab !== 'branding' && tab !== 'academics' && tab !== 'fees' && (
            <ComingSoon tab={tab} />
          )}
        </div>
      </div>
    </div>
  )
}

function ProfileTab() {
  const { activeSchool, refetch } = useSchool()
  const [saved, setSaved] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    values: {
      name: activeSchool?.name ?? '',
      motto: activeSchool?.motto ?? '',
      address: activeSchool?.address ?? '',
      phone: activeSchool?.phone ?? '',
      email: activeSchool?.email ?? '',
      website: activeSchool?.website ?? '',
    },
  })

  const onSubmit = async (values: ProfileForm) => {
    if (!activeSchool) return
    const { error } = await supabase
      .from('schools')
      .update({
        name: values.name,
        motto: values.motto || null,
        address: values.address || null,
        phone: values.phone || null,
        email: values.email || null,
        website: values.website || null,
      })
      .eq('id', activeSchool.id)
    if (error) return
    await refetch()
    reset(values)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <Card>
      <CardHeader title="School profile" description="These details appear on report cards and receipts." />
      <CardBody>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Field label="School name" htmlFor="name" error={errors.name?.message}>
            <Input id="name" {...register('name')} />
          </Field>
          <Field label="Motto / slogan" htmlFor="motto" hint="Shown under the school name on documents.">
            <Input id="motto" {...register('motto')} placeholder="Knowledge · Character · Service" />
          </Field>
          <Field label="Address" htmlFor="address">
            <Input id="address" {...register('address')} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Phone" htmlFor="phone">
              <Input id="phone" {...register('phone')} />
            </Field>
            <Field label="Email" htmlFor="email" error={errors.email?.message}>
              <Input id="email" type="email" {...register('email')} />
            </Field>
          </div>
          <Field label="Website" htmlFor="website">
            <Input id="website" {...register('website')} placeholder="https://" />
          </Field>

          <div className="mt-2 flex items-center gap-3">
            <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
              Save changes
            </Button>
            {saved && (
              <span className="flex items-center gap-1 text-sm text-success">
                <Check className="h-4 w-4" /> Saved
              </span>
            )}
          </div>
        </form>
      </CardBody>
    </Card>
  )
}

function BrandingTab() {
  const { activeSchool, refetch } = useSchool()
  const [color, setColor] = useState(activeSchool?.primary_color ?? '#1E5A43')
  const [logoUrl, setLogoUrl] = useState(activeSchool?.logo_url ?? '')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setColor(activeSchool?.primary_color ?? '#1E5A43')
    setLogoUrl(activeSchool?.logo_url ?? '')
  }, [activeSchool])

  const onPickFile = async (file: File) => {
    if (!activeSchool) return
    setError(null)
    setUploading(true)
    try {
      const dataUrl = await fileToLogoDataUrl(file)
      setLogoUrl(dataUrl)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load logo.')
    } finally {
      setUploading(false)
    }
  }

  const save = async () => {
    if (!activeSchool) return
    setSaving(true)
    const { error } = await supabase
      .from('schools')
      .update({ primary_color: color, logo_url: logoUrl || null })
      .eq('id', activeSchool.id)
    setSaving(false)
    if (error) return
    await refetch()
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <Card>
      <CardHeader title="Branding" description="Your logo and colour appear across the app and on printed documents." />
      <CardBody className="flex flex-col gap-5">
        <div>
          <p className="mb-1.5 text-sm font-medium text-foreground">School logo</p>
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-md border border-border bg-muted-surface">
              {logoUrl ? <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" /> : <ImageUp className="h-6 w-6 text-faint" />}
            </div>
            <div className="flex flex-col items-start gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) onPickFile(f)
                }}
              />
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>
                  <ImageUp className="h-4 w-4" /> {logoUrl ? 'Change logo' : 'Upload logo'}
                </Button>
                {logoUrl && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setLogoUrl('')}>
                    <X className="h-4 w-4" /> Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted">PNG, JPG, WebP or SVG · up to 2&nbsp;MB</p>
            </div>
          </div>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-foreground">Primary colour</p>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-14 cursor-pointer rounded-md border border-border bg-surface"
              aria-label="Primary colour"
            />
            <Input value={color} onChange={(e) => setColor(e.target.value)} className="w-32 font-mono" />
          </div>
        </div>

        {/* Live preview */}
        <div className="rounded-md border border-border p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Preview</p>
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md text-white"
              style={{ background: color }}
            >
              {logoUrl ? <img src={logoUrl} alt="" className="h-10 w-10 object-cover" /> : '★'}
            </div>
            <span className="font-serif text-lg font-semibold" style={{ color }}>
              {activeSchool?.name ?? 'Your School'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={save} loading={saving}>
            Save branding
          </Button>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-success">
              <Check className="h-4 w-4" /> Saved
            </span>
          )}
        </div>
      </CardBody>
    </Card>
  )
}

const CURRENCIES = ['NGN', 'GHS', 'KES', 'USD', 'GBP', 'EUR']

function FeesSettingsTab() {
  const { activeSchool, refetch } = useSchool()
  const [currency, setCurrency] = useState(activeSchool?.currency ?? 'NGN')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => setCurrency(activeSchool?.currency ?? 'NGN'), [activeSchool])

  const save = async () => {
    if (!activeSchool) return
    setSaving(true)
    const { error } = await supabase.from('schools').update({ currency }).eq('id', activeSchool.id)
    setSaving(false)
    if (error) return
    await refetch()
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <Card>
      <CardHeader title="Fees & finance" description="Currency and finance settings. Fee amounts, invoices and payments live in the Fees section." />
      <CardBody className="flex flex-col gap-5">
        <Field label="Currency" htmlFor="fee-currency" hint="Used across invoices, payments and reports.">
          <Select id="fee-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="sm:max-w-xs">
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </Field>

        <div className="rounded-md border border-border bg-muted-surface p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Receipt className="h-4 w-4 text-primary" /> Fee structures &amp; payments
          </p>
          <p className="mt-1 text-sm text-muted">
            Define fees, generate invoices and record bank payments in the dedicated Fees section.
          </p>
          <Link to="/fees" className="mt-3 inline-block">
            <Button variant="outline" size="sm">Open Fees</Button>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={save} loading={saving}>Save changes</Button>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-success">
              <Check className="h-4 w-4" /> Saved
            </span>
          )}
        </div>
      </CardBody>
    </Card>
  )
}

function ComingSoon({ tab }: { tab: TabId }) {
  const phase: Record<string, string> = {
    academics: 'Grading bands, sessions & terms — Phase 1/2',
    communication: 'SMS / WhatsApp senders & automatic alerts — Phase 3',
    security: 'Audit log, sessions & data export — Phase 1',
    subscription: 'Plan & billing — SaaS',
  }
  return (
    <Card>
      <CardBody className="flex flex-col items-start gap-2 py-10 text-center">
        <div className="w-full text-center">
          <p className="font-serif text-lg font-semibold text-foreground">Coming soon</p>
          <p className="mt-1 text-sm text-muted">{phase[tab]}</p>
        </div>
      </CardBody>
    </Card>
  )
}
