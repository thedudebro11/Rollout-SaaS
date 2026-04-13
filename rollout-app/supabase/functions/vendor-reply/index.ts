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

async function sendTwilioSms(
  accountSid: string,
  authToken:  string,
  from:       string,
  to:         string,
  body:       string,
): Promise<{ ok: boolean; sid: string | null; errorMessage: string | null }> {
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method:  'POST',
      headers: {
        Authorization:  'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: from, To: to, Body: body }).toString(),
    }
  )
  const data = await res.json()
  return { ok: res.ok, sid: data.sid ?? null, errorMessage: data.message ?? null }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405)

  // ── [CP1] Auth — verify the calling user's JWT manually ──────────────────
  const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
  const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY')!

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user }, error: authErr } = await anonClient.auth.getUser()
  if (authErr || !user) {
    console.error('[CP1] unauthorized:', authErr?.message)
    return json({ error: 'Unauthorized' }, 401)
  }
  console.log('[CP1] user:', user.id)

  // ── [CP2] Parse request body ──────────────────────────────────────────────
  const { conversation_id, body: messageBody } = await req.json()
  if (!conversation_id || !messageBody?.trim()) {
    return json({ error: 'conversation_id and body are required' }, 400)
  }

  // ── [CP3] Init service role client ────────────────────────────────────────
  const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')
  if (!serviceRoleKey) {
    console.error('[CP3] SERVICE_ROLE_KEY not set')
    return json({ error: 'Server misconfiguration' }, 500)
  }
  const db = createClient(SUPABASE_URL, serviceRoleKey)

  // ── [CP4] Verify vendor owns this conversation ────────────────────────────
  const { data: vendor, error: vendorErr } = await db
    .from('vendors')
    .select('id, twilio_phone_number')
    .eq('user_id', user.id)
    .single()

  if (vendorErr || !vendor) {
    console.error('[CP4] vendor not found:', vendorErr?.message)
    return json({ error: 'Vendor not found' }, 404)
  }

  const { data: conversation, error: convErr } = await db
    .from('conversations')
    .select('id, vendor_id, subscriber_id, status')
    .eq('id', conversation_id)
    .single()

  if (convErr || !conversation) {
    return json({ error: 'Conversation not found' }, 404)
  }
  if (conversation.vendor_id !== vendor.id) {
    return json({ error: 'Forbidden' }, 403)
  }

  console.log('[CP4] ownership verified, conversation:', conversation_id)

  // ── [CP5] Get subscriber phone number ─────────────────────────────────────
  const { data: subscriber, error: subErr } = await db
    .from('subscribers')
    .select('id, phone_number, is_active')
    .eq('id', conversation.subscriber_id)
    .single()

  if (subErr || !subscriber) {
    return json({ error: 'Subscriber not found' }, 404)
  }

  // ── [CP6] Send SMS via Twilio ─────────────────────────────────────────────
  const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
  const twilioAuthToken  = Deno.env.get('TWILIO_AUTH_TOKEN')

  let sendOk   = false
  let twilioSid: string | null = null

  if (twilioAccountSid && twilioAuthToken && vendor.twilio_phone_number) {
    try {
      const result = await sendTwilioSms(
        twilioAccountSid,
        twilioAuthToken,
        vendor.twilio_phone_number,
        subscriber.phone_number,
        messageBody.trim(),
      )
      sendOk    = result.ok
      twilioSid = result.sid
      if (!result.ok) console.error('[CP6] Twilio error:', result.errorMessage)
      else console.log('[CP6] SMS sent:', twilioSid)
    } catch (err) {
      console.error('[CP6] Twilio threw:', err.message)
    }
  } else {
    console.log('[CP6] Twilio not configured — skipping SMS send')
    sendOk = true  // Allow message to be saved even without Twilio in dev
  }

  // ── [CP7] Persist message + update conversation ───────────────────────────
  const now = new Date().toISOString()

  const { data: newMessage, error: msgErr } = await db
    .from('conversation_messages')
    .insert({
      conversation_id: conversation_id,
      body:            messageBody.trim(),
      direction:       'outbound',
    })
    .select('id, body, direction, created_at')
    .single()

  if (msgErr) {
    console.error('[CP7] message insert failed:', msgErr.message)
    return json({ error: 'Failed to save message' }, 500)
  }

  // Update conversation last_message_at and reopen if resolved
  await db.from('conversations')
    .update({ last_message_at: now, status: 'open' })
    .eq('id', conversation_id)

  // Log to sms_log
  await db.from('sms_log').insert({
    vendor_id:          vendor.id,
    subscriber_id:      subscriber.id,
    phone_number:       subscriber.phone_number,
    message_body:       messageBody.trim(),
    direction:          'outbound',
    message_type:       'vendor_reply',
    twilio_message_sid: twilioSid,
    status:             sendOk ? 'sent' : 'failed',
  })

  // Keep subscriber in in_conversation state
  await db.from('subscriber_sms_state')
    .update({ current_state: 'in_conversation', active_conversation_id: conversation_id, updated_at: now })
    .eq('vendor_id', vendor.id)
    .eq('subscriber_id', subscriber.id)

  console.log('[CP7] done — message saved:', newMessage.id)

  return json({ success: true, message: newMessage })
})
