import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { School } from 'lucide-react'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/field'

type Mode = 'signin' | 'signup'

export function LoginPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('signin')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isSignup = mode === 'signup'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setLoading(true)

    if (isSignup) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      })
      setLoading(false)
      if (error) {
        setError(error.message)
        return
      }
      // If email confirmation is on, there is no session yet.
      if (!data.session) {
        setNotice('Check your email to confirm your account, then sign in.')
        setMode('signin')
        return
      }
      navigate('/')
      return
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate('/')
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <School className="h-6 w-6" />
          </div>
          <h1 className="font-serif text-2xl font-semibold text-foreground">
            {isSignup ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {isSignup ? 'Set up an owner account to register your school.' : 'Sign in to your school platform.'}
          </p>
        </div>

        {!supabaseConfigured && (
          <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            Supabase isn't configured yet. Add your project URL and anon key to
            <span className="font-mono"> .env.local</span> to enable sign-in.
          </div>
        )}

        {notice && (
          <div className="mb-4 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">
            {notice}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {isSignup && (
            <Field label="Full name" htmlFor="fullName">
              <Input
                id="fullName"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
              />
            </Field>
          )}
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@school.ng"
            />
          </Field>
          <Field label="Password" htmlFor="password" hint={isSignup ? 'At least 6 characters.' : undefined}>
            <Input
              id="password"
              type="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Field>

          {error && <p className="text-sm text-danger">{error}</p>}

          <Button type="submit" size="lg" loading={loading} className="mt-2">
            {isSignup ? 'Create account' : 'Sign in'}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-muted">
          {isSignup ? (
            <>
              Already have an account?{' '}
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => {
                  setMode('signin')
                  setError(null)
                }}
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              Setting up a new school?{' '}
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => {
                  setMode('signup')
                  setError(null)
                  setNotice(null)
                }}
              >
                Create an account
              </button>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-faint">
          Parents and staff join by invitation from their school.
        </p>
      </div>
    </div>
  )
}
