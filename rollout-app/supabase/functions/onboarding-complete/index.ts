// @ts-nocheck — Deno runtime file, not processed by Node/browser TypeScript

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ── Twilio helpers ────────────────────────────────────────────────────────────

async function provisionPhoneNumber(accountSid: string, authToken: string, webhookUrl: string) {
  const base = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`
  const authHeader = 'Basic ' + btoa(`${accountSid}:${authToken}`)

  const searchRes = await fetch(`${base}/AvailablePhoneNumbers/US/Local.json?Limit=1`, {
    headers: { Authorization: authHeader },
  })
  const searchJson = await searchRes.json()
  if (!searchRes.ok) throw new Error(searchJson.message || 'Twilio search failed')
  if (!searchJson.available_phone_numbers?.length) throw new Error('No available numbers')

  const numberToProvision = searchJson.available_phone_numbers[0].phone_number

  const purchaseRes = await fetch(`${base}/IncomingPhoneNumbers.json`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ PhoneNumber: numberToProvision, SmsUrl: webhookUrl, SmsMethod: 'POST' }).toString(),
  })
  const purchaseJson = await purchaseRes.json()
  if (!purchaseRes.ok) throw new Error(purchaseJson.message || 'Twilio purchase failed')

  return { phoneNumber: purchaseJson.phone_number, sid: purchaseJson.sid }
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // ── Checkpoint 1: auth ────────────────────────────────────────────────────
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    console.error('[CP1] auth failed:', authError?.message)
    return json({ error: 'Unauthorized', checkpoint: 'auth' }, 401)
  }
  console.log('[CP1] auth ok, user:', user.id)

  // ── Checkpoint 2: parse body ──────────────────────────────────────────────
  let vendor_id: string
  try {
    const body = await req.json()
    vendor_id = body.vendor_id
    if (!vendor_id) throw new Error('vendor_id missing')
  } catch (err) {
    console.error('[CP2] body parse failed:', err.message)
    return json({ error: 'Invalid request body', checkpoint: 'body_parse' }, 400)
  }
  console.log('[CP2] body ok, vendor_id:', vendor_id)

  // ── Checkpoint 3: vendor lookup ───────────────────────────────────────────
  const { data: vendor, error: vendorError } = await supabase
    .from('vendors')
    .select('id, user_id, twilio_phone_number, onboarding_complete')
    .eq('id', vendor_id)
    .single()

  if (vendorError || !vendor) {
    console.error('[CP3] vendor not found:', vendorError?.message)
    return json({ error: 'Vendor not found', checkpoint: 'vendor_lookup', details: vendorError?.message }, 404)
  }
  if (vendor.user_id !== user.id) {
    console.error('[CP3] ownership mismatch')
    return json({ error: 'Forbidden', checkpoint: 'vendor_ownership' }, 403)
  }
  console.log('[CP3] vendor ok:', vendor.id)

  // ── Checkpoint 4: admin client ────────────────────────────────────────────
  const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')
  if (!serviceRoleKey) {
    console.error('[CP4] SUPABASE_SERVICE_ROLE_KEY not set')
    return json({ error: 'Server misconfiguration: missing service role key', checkpoint: 'service_role_key' }, 500)
  }
  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey)
  console.log('[CP4] admin client ok')

  // ── Checkpoint 5: Twilio provisioning (skip if creds not set) ─────────────
  let twilioPhoneNumber = vendor.twilio_phone_number

  if (!twilioPhoneNumber) {
    const accountSid  = Deno.env.get('TWILIO_ACCOUNT_SID')
    const authToken   = Deno.env.get('TWILIO_AUTH_TOKEN')
    const webhookUrl  = Deno.env.get('TWILIO_WEBHOOK_URL')

    if (!accountSid || !authToken || !webhookUrl) {
      console.log('[CP5] Twilio creds not set — skipping provisioning')
    } else {
      console.log('[CP5] provisioning Twilio number...')
      let provisionedNumber: string | null = null
      let provisionedSid: string | null = null
      let provisionError = ''

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const result = await provisionPhoneNumber(accountSid, authToken, webhookUrl)
          provisionedNumber = result.phoneNumber
          provisionedSid = result.sid
          console.log('[CP5] provisioned:', provisionedNumber)
          break
        } catch (err) {
          provisionError = err.message
          console.error(`[CP5] attempt ${attempt} failed:`, provisionError)
          if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt))
        }
      }

      if (provisionedNumber) {
        const { error: storeErr } = await supabaseAdmin
          .from('vendors')
          .update({ twilio_phone_number: provisionedNumber, twilio_phone_sid: provisionedSid })
          .eq('id', vendor_id)
        if (storeErr) console.error('[CP5] store phone failed:', storeErr.message)
        else twilioPhoneNumber = provisionedNumber
      } else {
        console.error('[CP5] all provisioning attempts failed:', provisionError)
        // Non-fatal — continue to mark onboarding complete
      }
    }
  } else {
    console.log('[CP5] already has Twilio number, skipping')
  }

  // ── Checkpoint 6: mark onboarding complete ────────────────────────────────
  const { error: updateErr } = await supabaseAdmin
    .from('vendors')
    .update({ onboarding_complete: true })
    .eq('id', vendor_id)

  if (updateErr) {
    console.error('[CP6] onboarding_complete update failed:', updateErr.message)
    return json({ error: 'Failed to complete onboarding', checkpoint: 'onboarding_complete', details: updateErr.message }, 500)
  }
  console.log('[CP6] onboarding_complete = true')

  return json({ success: true, twilio_phone_number: twilioPhoneNumber })
})
