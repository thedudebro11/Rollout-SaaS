// @ts-nocheck — Deno runtime file, not processed by Node/browser TypeScript

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TWILIO_ACCOUNT_SID  = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_AUTH_TOKEN   = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_WEBHOOK_URL  = Deno.env.get('TWILIO_WEBHOOK_URL')!  // this function's sibling: /twilio-inbound

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Twilio helpers ────────────────────────────────────────────────────────────

const twilioBase = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}`

function twilioAuth() {
  return 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)
}

async function twilioRequest(path: string, method: string, body?: Record<string, string>) {
  const res = await fetch(`${twilioBase}${path}`, {
    method,
    headers: {
      Authorization: twilioAuth(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.message || 'Twilio API error')
  return json
}

async function provisionPhoneNumber(): Promise<{ phoneNumber: string; sid: string }> {
  // Search for an available US local number
  const available = await twilioRequest(
    `/AvailablePhoneNumbers/US/Local.json?Limit=1`,
    'GET'
  )

  if (!available.available_phone_numbers?.length) {
    throw new Error('No available phone numbers found')
  }

  const numberToProvision = available.available_phone_numbers[0].phone_number

  // Purchase the number and point its inbound webhook at our handler
  const purchased = await twilioRequest(
    `/IncomingPhoneNumbers.json`,
    'POST',
    {
      PhoneNumber: numberToProvision,
      SmsUrl: TWILIO_WEBHOOK_URL,
      SmsMethod: 'POST',
    }
  )

  return { phoneNumber: purchased.phone_number, sid: purchased.sid }
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Auth — get calling user's session from the JWT in the Authorization header
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { vendor_id } = await req.json()

    // Verify vendor belongs to this user
    const { data: vendor, error: vendorError } = await supabase
      .from('vendors')
      .select('id, user_id, twilio_phone_number, onboarding_complete')
      .eq('id', vendor_id)
      .single()

    if (vendorError || !vendor) {
      return new Response(JSON.stringify({ error: 'Vendor not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (vendor.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Use service role for writes that bypass RLS
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    let twilioPhoneNumber = vendor.twilio_phone_number

    // Only provision if not already done (idempotent)
    if (!twilioPhoneNumber) {
      let provisionedNumber: string | null = null
      let provisionedSid: string | null = null
      let provisionError: string | null = null

      // Retry up to 3 times per spec
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const result = await provisionPhoneNumber()
          provisionedNumber = result.phoneNumber
          provisionedSid = result.sid
          break
        } catch (err) {
          provisionError = err.message
          if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt))
        }
      }

      if (!provisionedNumber) {
        // Log failure — still mark onboarding complete so vendor isn't stuck
        console.error(`Twilio provisioning failed for vendor ${vendor_id}: ${provisionError}`)

        await supabaseAdmin
          .from('vendors')
          .update({ onboarding_complete: true })
          .eq('id', vendor_id)

        return new Response(
          JSON.stringify({
            success: true,
            twilio_provisioned: false,
            error: 'Phone number provisioning failed — our team has been notified.',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Store on vendor row
      await supabaseAdmin
        .from('vendors')
        .update({
          twilio_phone_number: provisionedNumber,
          twilio_phone_sid: provisionedSid,
        })
        .eq('id', vendor_id)

      twilioPhoneNumber = provisionedNumber
    }

    // Mark onboarding complete
    await supabaseAdmin
      .from('vendors')
      .update({ onboarding_complete: true })
      .eq('id', vendor_id)

    return new Response(
      JSON.stringify({ success: true, twilio_phone_number: twilioPhoneNumber }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('onboarding-complete error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
