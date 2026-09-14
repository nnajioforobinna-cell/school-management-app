import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { School } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/AuthProvider'
import { useSchool } from '@/providers/SchoolProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'

/** Shown when a signed-in user belongs to no school yet: create one (becomes owner). */
export function OnboardingPage() {
  const { user } = useAuth()
  const { setActiveSchoolId, refetch } = useSchool()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setError(null)
    setLoading(true)

    const { data: school, error: schoolErr } = await supabase
      .from('schools')
      .insert({ name: name.trim(), created_by: user.id })
      .select()
      .single()

    if (schoolErr || !school) {
      setLoading(false)
      setError(schoolErr?.message ?? 'Could not create the school.')
      return
    }

    const { error: roleErr } = await supabase
      .from('user_school_roles')
      .insert({ user_id: user.id, school_id: school.id, role: 'owner', status: 'active' })

    setLoading(false)
    if (roleErr) {
      setError(roleErr.message)
      return
    }

    setActiveSchoolId(school.id)
    await refetch()
    navigate('/settings')
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <School className="h-6 w-6" />
          </div>
          <h1 className="font-serif text-2xl font-semibold text-foreground">Set up your school</h1>
          <p className="mt-1 text-sm text-muted">
            Create your school to get started. You can add all the details next.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="School name" htmlFor="name">
            <Input
              id="name"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Brightway College"
            />
          </Field>

          {error && <p className="text-sm text-danger">{error}</p>}

          <Button type="submit" size="lg" loading={loading} disabled={!name.trim()}>
            Create school
          </Button>
        </form>
      </div>
    </div>
  )
}
