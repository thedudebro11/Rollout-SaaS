// @ts-nocheck — Deno runtime file, not processed by Node/browser TypeScript

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405)

  const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
  const SERVICE_ROLE_KEY  = Deno.env.get('SERVICE_ROLE_KEY')

  if (!SERVICE_ROLE_KEY) {
    console.error('[resolve-conversation] SERVICE_ROLE_KEY not set')
    return json({ error: 'Server misconfiguration: missing service role key' }, 500)
  }

  // ── Auth: verify caller via user-scoped client ────────────────────────────
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })

  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) {
    return json({ error: 'Unauthorized' }, 401)
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let conversation_id: string
  try {
    const body = await req.json()
    conversation_id = body.conversation_id
    if (!conversation_id) throw new Error('conversation_id missing')
  } catch {
    return json({ error: 'Invalid request body: conversation_id is required' }, 400)
  }

  // ── Ownership check (invariant 1.4): get vendor for this user ─────────────
  const { data: vendor, error: vendorErr } = await userClient
    .from('vendors')
    .select('id, user_id')
    .eq('user_id', user.id)
    .single()

  if (vendorErr || !vendor) {
    return json({ error: 'Vendor not found' }, 404)
  }

  // ── Verify the conversation belongs to this vendor ────────────────────────
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: conversation, error: convErr } = await adminClient
    .from('conversations')
    .select('id, vendor_id, subscriber_id')
    .eq('id', conversation_id)
    .single()

  if (convErr || !conversation) {
    return json({ error: 'Conversation not found' }, 404)
  }

  if (conversation.vendor_id !== vendor.id) {
    return json({ error: 'Forbidden' }, 403)
  }

  // ── Mark conversation resolved ────────────────────────────────────────────
  const { error: resolveErr } = await adminClient
    .from('conversations')
    .update({ status: 'resolved' })
    .eq('id', conversation_id)

  if (resolveErr) {
    console.error('[resolve-conversation] failed to update conversation status:', resolveErr.message)
    return json({ error: 'Failed to resolve conversation' }, 500)
  }

  // ── Reset subscriber SMS state to idle ────────────────────────────────────
  const { error: stateErr } = await adminClient
    .from('subscriber_sms_state')
    .update({ current_state: 'idle', active_conversation_id: null, updated_at: new Date().toISOString() })
    .eq('subscriber_id', conversation.subscriber_id)
    .eq('vendor_id', vendor.id)

  if (stateErr) {
    console.error('[resolve-conversation] failed to reset subscriber sms state:', stateErr.message)
    return json({ error: 'Failed to reset subscriber state' }, 500)
  }

  return json({ success: true })
})
