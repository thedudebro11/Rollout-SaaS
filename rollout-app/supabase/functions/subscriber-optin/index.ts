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

function isValidE164(phone: string): boolean {
  return /^\+1[2-9]\d{9}$/.test(phone)
}

// SMS templates
function confirmationSms(vendorName: string): string {
  return `You're on ${vendorName}'s list! We'll text you our locations so you never miss us. Reply STOP anytime.`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')
  if (!serviceRoleKey) {
    return json({ error: 'Server misconfiguration' }, 500)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey
  )

  // ── Parse body ──────────────────────────────────────────────────────────────
  let vendor_slug: string, phone_number: string
  try {
    const body = await req.json()
    vendor_slug  = body.vendor_slug
    phone_number = body.phone_number
    if (!vendor_slug || !phone_number) throw new Error('missing fields')
  } catch {
    return json({ error: 'Invalid request body' }, 400)
  }

  // ── Validate phone ──────────────────────────────────────────────────────────
  if (!isValidE164(phone_number)) {
    return json({ error: 'Please enter a valid US phone number' }, 422)
  }

  // ── Look up vendor by slug ──────────────────────────────────────────────────
  const { data: vendor, error: vendorError } = await supabase
    .from('vendors')
    .select('id, name, twilio_phone_number, google_review_url')
    .eq('slug', vendor_slug)
    .eq('onboarding_complete', true)
    .single()

  if (vendorError || !vendor) {
    return json({ error: 'Vendor not found' }, 404)
  }

  // ── Check existing subscriber ───────────────────────────────────────────────
  const { data: existing } = await supabase
    .from('subscribers')
    .select('id, is_active')
    .eq('vendor_id', vendor.id)
    .eq('phone_number', phone_number)
    .single()

  if (existing) {
    // Re-activating an opted-out subscriber
    if (!existing.is_active) {
      await supabase
        .from('subscribers')
        .update({ is_active: true })
        .eq('id', existing.id)
    }
    return json({ success: true, already_subscribed: true })
  }

  // ── Insert new subscriber ───────────────────────────────────────────────────
  const { data: newSub, error: insertError } = await supabase
    .from('subscribers')
    .insert({ vendor_id: vendor.id, phone_number })
    .select('id')
    .single()

  if (insertError || !newSub) {
    console.error('subscriber insert failed:', insertError?.message)
    return json({ error: 'Something went wrong, please try again' }, 500)
  }

  // ── Create idle SMS state row ───────────────────────────────────────────────
  await supabase
    .from('subscriber_sms_state')
    .insert({
      vendor_id: vendor.id,
      subscriber_id: newSub.id,
      current_state: 'idle',
    })

  // ── Send confirmation SMS via Twilio ────────────────────────────────────────
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
  const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN')

  if (accountSid && authToken && vendor.twilio_phone_number) {
    const smsBody = confirmationSms(vendor.name)

    try {
      const twilioRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: 'Basic ' + btoa(`${accountSid}:${authToken}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            From: vendor.twilio_phone_number,
            To:   phone_number,
            Body: smsBody,
          }).toString(),
        }
      )

      const twilioJson = await twilioRes.json()

      // Log to sms_log regardless of success/failure
      await supabase.from('sms_log').insert({
        vendor_id:    vendor.id,
        subscriber_id: newSub.id,
        phone_number,
        message_body: smsBody,
        direction:    'outbound',
        message_type: 'opt_in_confirm',
        twilio_message_sid: twilioJson.sid ?? null,
        status: twilioRes.ok ? 'sent' : 'failed',
      })

      if (!twilioRes.ok) {
        console.error('Twilio send failed:', twilioJson.message)
        // Non-fatal — subscriber is still created
      }
    } catch (err) {
      console.error('Twilio request threw:', err.message)
      // Non-fatal
    }
  } else {
    console.log('Twilio not configured — skipping confirmation SMS')
  }

  return json({ success: true, already_subscribed: false })
})
