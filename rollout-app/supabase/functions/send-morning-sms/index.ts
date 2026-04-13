// @ts-nocheck — Deno runtime file, not processed by Node/browser TypeScript

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Vendor {
  id: string
  name: string
  timezone: string
  notification_time: string
  twilio_phone_number: string
}

interface Location {
  id: string
  address: string
  start_time: string
  end_time: string
  notes: string | null
}

interface Subscriber {
  id: string
  phone_number: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Returns 'HH:MM' for the current time in the given IANA timezone.
 */
function getCurrentTimeInZone(timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(new Date())
  const hour   = parts.find(p => p.type === 'hour')?.value   ?? '00'
  const minute = parts.find(p => p.type === 'minute')?.value ?? '00'
  // Intl can return '24' for midnight in some locales — normalise to '00'
  return `${hour === '24' ? '00' : hour}:${minute}`
}

/**
 * Returns 'YYYY-MM-DD' for today in the given IANA timezone.
 */
function getTodayInZone(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year:  'numeric',
    month: '2-digit',
    day:   '2-digit',
  }).format(new Date()) // en-CA locale produces YYYY-MM-DD
}

/**
 * Returns true if the vendor's notification_time falls within the current
 * 5-minute cron window in their timezone.
 */
function isVendorDueNow(vendor: Vendor): boolean {
  const currentTime   = getCurrentTimeInZone(vendor.timezone)
  const notifTime     = vendor.notification_time.substring(0, 5) // 'HH:MM'

  const [notifH, notifM]  = notifTime.split(':').map(Number)
  const [currH,  currM]   = currentTime.split(':').map(Number)

  const notifMinutes = notifH * 60 + notifM
  const currMinutes  = currH  * 60 + currM

  return currMinutes >= notifMinutes && currMinutes < notifMinutes + 5
}

/**
 * Formats a 'HH:MM:SS' time string to '8:00 AM'.
 */
function formatTime(timeStr: string): string {
  const [hoursStr, minutesStr] = timeStr.split(':')
  const hours   = parseInt(hoursStr,   10)
  const minutes = parseInt(minutesStr, 10)
  const period  = hours >= 12 ? 'PM' : 'AM'
  const h       = hours % 12 || 12
  return `${h}:${minutes.toString().padStart(2, '0')} ${period}`
}

/**
 * Builds the outbound SMS body for a vendor's day schedule.
 * Single location → one-liner. Multiple → bulleted list.
 */
function buildSmsBody(vendorName: string, locations: Location[]): string {
  if (locations.length === 1) {
    const loc       = locations[0]
    const timeRange = `${formatTime(loc.start_time)}-${formatTime(loc.end_time)}`
    const notesPart = loc.notes ? ` ${loc.notes}` : ''
    return `${vendorName} today: ${loc.address}, ${timeRange}.${notesPart} Reply STOP to opt out.`
  }

  const lines = locations.map(loc => {
    const timeRange = `${formatTime(loc.start_time)}-${formatTime(loc.end_time)}`
    return `- ${loc.address}, ${timeRange}`
  })
  return `${vendorName} is at multiple spots today:\n${lines.join('\n')}\nReply STOP to opt out.`
}

/**
 * Sends a single SMS via Twilio. Returns ok, sid, and error message if any.
 */
async function sendTwilioSms(
  accountSid: string,
  authToken:  string,
  from:       string,
  to:         string,
  body:       string,
): Promise<{ ok: boolean; sid: string | null; errorMessage: string | null }> {
  const res  = await fetch(
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
  return {
    ok:           res.ok,
    sid:          data.sid          ?? null,
    errorMessage: data.message      ?? null,
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok')
  if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405)

  // ── [CP1] Validate cron secret ────────────────────────────────────────────
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret) {
    console.error('[CP1] CRON_SECRET not set')
    return json({ error: 'Server misconfiguration: CRON_SECRET not set' }, 500)
  }
  const authHeader = req.headers.get('Authorization') ?? ''
  if (authHeader !== `Bearer ${cronSecret}`) {
    console.error('[CP1] unauthorized — invalid or missing cron secret')
    return json({ error: 'Unauthorized' }, 401)
  }
  console.log('[CP1] auth ok')

  // ── [CP2] Init service role client ────────────────────────────────────────
  const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')
  if (!serviceRoleKey) {
    console.error('[CP2] SERVICE_ROLE_KEY not set')
    return json({ error: 'Server misconfiguration: SERVICE_ROLE_KEY not set' }, 500)
  }
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey)
  console.log('[CP2] service role client ok')

  // ── [CP3] Load Twilio credentials ─────────────────────────────────────────
  const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
  const twilioAuthToken  = Deno.env.get('TWILIO_AUTH_TOKEN')
  if (!twilioAccountSid || !twilioAuthToken) {
    console.error('[CP3] Twilio credentials not set — aborting')
    return json({ error: 'Server misconfiguration: Twilio credentials not set' }, 500)
  }
  console.log('[CP3] Twilio credentials ok')

  // ── [CP4] Fetch all vendors eligible for morning SMS ─────────────────────
  // Eligible = onboarding complete AND has a provisioned Twilio number
  const { data: vendors, error: vendorFetchError } = await supabase
    .from('vendors')
    .select('id, name, timezone, notification_time, twilio_phone_number')
    .eq('onboarding_complete', true)
    .not('twilio_phone_number', 'is', null)

  if (vendorFetchError) {
    console.error('[CP4] vendor fetch failed:', vendorFetchError.message)
    return json({ error: 'Failed to fetch vendors', details: vendorFetchError.message }, 500)
  }

  console.log(`[CP4] found ${vendors?.length ?? 0} eligible vendors`)

  // ── [CP5] Filter vendors due in this 5-minute window ─────────────────────
  const dueVendors = (vendors ?? []).filter(isVendorDueNow)
  console.log(`[CP5] ${dueVendors.length} vendor(s) due for morning SMS now`)

  if (dueVendors.length === 0) {
    return json({ success: true, vendors_processed: 0, sms_sent: 0 })
  }

  // ── [CP6] Process each vendor ─────────────────────────────────────────────
  let totalSmsSent = 0
  let totalSmsFailed = 0

  for (const vendor of dueVendors) {
    const today = getTodayInZone(vendor.timezone)
    console.log(`[CP6] processing vendor ${vendor.id} (${vendor.name}), today=${today}`)

    // ── Fetch today's unsent locations ──────────────────────────────────────
    const { data: locations, error: locError } = await supabase
      .from('locations')
      .select('id, address, start_time, end_time, notes')
      .eq('vendor_id', vendor.id)
      .eq('date', today)
      .eq('morning_sms_sent', false)
      .order('start_time', { ascending: true })

    if (locError) {
      console.error(`[CP6] location fetch failed for vendor ${vendor.id}:`, locError.message)
      continue
    }

    if (!locations || locations.length === 0) {
      console.log(`[CP6] no unsent locations for vendor ${vendor.id} today — skipping`)
      continue
    }

    console.log(`[CP6] vendor ${vendor.id} has ${locations.length} location(s) today`)

    // ── Fetch active subscribers ────────────────────────────────────────────
    const { data: subscribers, error: subError } = await supabase
      .from('subscribers')
      .select('id, phone_number')
      .eq('vendor_id', vendor.id)
      .eq('is_active', true)

    if (subError) {
      console.error(`[CP6] subscriber fetch failed for vendor ${vendor.id}:`, subError.message)
      continue
    }

    if (!subscribers || subscribers.length === 0) {
      console.log(`[CP6] no active subscribers for vendor ${vendor.id} — marking locations sent and skipping`)
      // Mark locations sent so they don't accumulate day-over-day
      await supabase
        .from('locations')
        .update({ morning_sms_sent: true })
        .eq('vendor_id', vendor.id)
        .eq('date', today)
        .eq('morning_sms_sent', false)
      continue
    }

    console.log(`[CP6] sending to ${subscribers.length} subscriber(s) for vendor ${vendor.id}`)

    // ── Build message (one SMS covers all of today's locations) ────────────
    const smsBody = buildSmsBody(vendor.name, locations)

    // ── Send to each subscriber and log ────────────────────────────────────
    // Use the first location's id for sms_log when there's one location,
    // null when the SMS covers multiple locations (no single canonical location).
    const logLocationId = locations.length === 1 ? locations[0].id : null

    for (const subscriber of subscribers) {
      let sendOk   = false
      let twilio_sid: string | null = null

      try {
        const result = await sendTwilioSms(
          twilioAccountSid,
          twilioAuthToken,
          vendor.twilio_phone_number,
          subscriber.phone_number,
          smsBody,
        )
        sendOk     = result.ok
        twilio_sid = result.sid
        if (!result.ok) {
          console.error(`[CP6] Twilio send failed for subscriber ${subscriber.id}:`, result.errorMessage)
        }
      } catch (err) {
        console.error(`[CP6] Twilio request threw for subscriber ${subscriber.id}:`, err.message)
      }

      // Log every attempt regardless of outcome (invariant 6.4)
      const { error: logError } = await supabase.from('sms_log').insert({
        vendor_id:          vendor.id,
        subscriber_id:      subscriber.id,
        phone_number:       subscriber.phone_number,
        message_body:       smsBody,
        direction:          'outbound',
        message_type:       'location_notify',
        twilio_message_sid: twilio_sid,
        status:             sendOk ? 'sent' : 'failed',
        location_id:        logLocationId,
      })

      if (logError) {
        console.error(`[CP6] sms_log insert failed for subscriber ${subscriber.id}:`, logError.message)
      }

      if (sendOk) totalSmsSent++
      else        totalSmsFailed++
    }

    // ── Mark all of today's locations as sent ──────────────────────────────
    const locationIds = locations.map(l => l.id)
    const { error: markError } = await supabase
      .from('locations')
      .update({ morning_sms_sent: true })
      .in('id', locationIds)

    if (markError) {
      console.error(`[CP6] failed to mark locations sent for vendor ${vendor.id}:`, markError.message)
    } else {
      console.log(`[CP6] marked ${locationIds.length} location(s) as morning_sms_sent for vendor ${vendor.id}`)
    }
  }

  console.log(`[CP6] done — sent: ${totalSmsSent}, failed: ${totalSmsFailed}`)

  return json({
    success:           true,
    vendors_processed: dueVendors.length,
    sms_sent:          totalSmsSent,
    sms_failed:        totalSmsFailed,
  })
})
