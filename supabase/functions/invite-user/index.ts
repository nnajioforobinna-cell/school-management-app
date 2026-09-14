// Invite a user to a school: create (or find) their auth account, confirm it,
// and link a role. Returns a temporary password for newly created accounts so
// the admin can hand over credentials (email delivery is unreliable here).
//
// Deployed with verify_jwt = true, so only signed-in callers reach this. The
// function additionally checks the caller is an owner/admin of the school.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function generatePassword(len = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

async function findUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  const target = email.toLowerCase()
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) break
    const match = data.users.find((u) => (u.email ?? '').toLowerCase() === target)
    if (match) return match
    if (data.users.length < 1000) break
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const authHeader = req.headers.get('Authorization') ?? ''
    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
    const {
      data: { user },
    } = await caller.auth.getUser()
    if (!user) return json(401, { error: 'Not authenticated' })

    const { school_id, email, role, full_name } = await req.json()
    if (!school_id || !email || !role) return json(400, { error: 'Missing school_id, email or role' })
    if (!['admin', 'bursar', 'teacher', 'parent'].includes(role)) {
      return json(400, { error: 'Invalid role' })
    }

    const admin = createClient(url, serviceKey)

    // Caller must be an owner/admin of this school.
    const { data: callerRoles } = await admin
      .from('user_school_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('school_id', school_id)
      .eq('status', 'active')
    const isAdmin = (callerRoles ?? []).some((r: { role: string }) => r.role === 'owner' || r.role === 'admin')
    if (!isAdmin) return json(403, { error: 'Only owners and admins can invite users' })

    // Create the account (auto-confirmed) or find the existing one.
    let userId: string
    let tempPassword: string | null = generatePassword()
    let created = false

    const { data: createdUser, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: full_name ?? '' },
    })

    if (createErr) {
      const existing = await findUserByEmail(admin, email)
      if (!existing) return json(400, { error: createErr.message })
      userId = existing.id
      tempPassword = null // existing users keep their password
    } else {
      userId = createdUser.user!.id
      created = true
    }

    // Link the role (idempotent).
    const { error: roleErr } = await admin
      .from('user_school_roles')
      .upsert(
        { user_id: userId, school_id, role, status: 'active' },
        { onConflict: 'user_id,school_id,role' },
      )
    if (roleErr) return json(400, { error: roleErr.message })

    return json(200, { user_id: userId, email, role, created, temp_password: tempPassword })
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : String(e) })
  }
})
