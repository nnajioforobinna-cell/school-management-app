// Send an announcement over SMS (Termii) to a school's members by role.
// If TERMII_API_KEY is not configured, returns { configured: false } so the
// app can tell the admin in-app delivery still happened.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const termiiKey = Deno.env.get('TERMII_API_KEY')
    const termiiSender = Deno.env.get('TERMII_SENDER_ID') ?? 'School'

    const caller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
    const { data: { user } } = await caller.auth.getUser()
    if (!user) return json(401, { error: 'Not authenticated' })

    const { school_id, announcement_id, roles } = await req.json()
    if (!school_id || !announcement_id) return json(400, { error: 'Missing school_id or announcement_id' })

    const admin = createClient(url, serviceKey)

    const { data: callerRoles } = await admin
      .from('user_school_roles').select('role').eq('user_id', user.id).eq('school_id', school_id).eq('status', 'active')
    const isAdmin = (callerRoles ?? []).some((r: { role: string }) => r.role === 'owner' || r.role === 'admin')
    if (!isAdmin) return json(403, { error: 'Only owners and admins can send announcements' })

    const { data: ann } = await admin.from('announcements').select('title, body').eq('id', announcement_id).single()
    const message = `${ann?.title ?? ''}${ann?.body ? `\n${ann.body}` : ''}`.trim()

    // Collect recipient phone numbers.
    const roleList: string[] = roles ?? ['owner', 'admin', 'bursar', 'teacher', 'parent', 'student']
    const { data: members } = await admin
      .from('user_school_roles').select('user_id').eq('school_id', school_id).eq('status', 'active').in('role', roleList)
    const ids = [...new Set((members ?? []).map((m: { user_id: string }) => m.user_id))]
    const { data: profiles } = await admin.from('profiles').select('phone').in('id', ids)
    const phones = [...new Set((profiles ?? []).map((p: { phone: string | null }) => p.phone).filter(Boolean))] as string[]

    if (!termiiKey) {
      return json(200, { configured: false, sent: 0, recipients: phones.length })
    }

    let sent = 0
    for (const to of phones) {
      const resp = await fetch('https://api.ng.termii.com/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, from: termiiSender, sms: message, type: 'plain', channel: 'generic', api_key: termiiKey }),
      })
      if (resp.ok) sent++
    }
    return json(200, { configured: true, sent, recipients: phones.length })
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : String(e) })
  }
})
