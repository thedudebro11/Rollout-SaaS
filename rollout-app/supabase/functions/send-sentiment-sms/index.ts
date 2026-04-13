// @ts-nocheck — Deno runtime file, not processed by Node/browser TypeScript

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Vendor {
  id: string
  name: string
  timezone: string
  sentiment_delay_hours: number
  twilio_phone_number: string
}

interface Location {
  id: string
  date: string
  end_time: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
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
  }).format(new Date())
}

/**
 * Returns current time as minutes since midnight in the given timezone.
 */
function getCurrentMinutesInZone(timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour:   '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const h = parseInt(parts.find(p => p.type === 'hour')?.value   ?? '0')
  const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0')
  return (h === 24 ? 0 : h) * 60 + m
}

/**
 * Returns true if enough time has passed after a location's end_time
 * (plus the vendor's sentiment delay) to send the sentiment SMS.
 * Cross-midnight locations (trigger >= 24:00) are skipped for now.
 */
function isSentimentDue(location: Location, vendor: Vendor): boolean {
  const today = getTodayInZone(vendor.timezone)
  if (today !== location.date) return false   // Location is not today in this timezone

  const [endH, endM] = location.end_time.split(':').map(Number)
  const triggerMinutes = endH * 60 + endM + vendor.sentiment_delay_hours * 60

  if (triggerMinutes >= 1440) return false    // Would trigger after midnight — skip

  return getCurrentMinutesInZone(vendor.timezone) >= triggerMinutes
}

/**
 * Sends a single SMS via Twilio.
 */
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
  return {
    ok:           res.ok,
    sid:          data.sid     ?? null,
    errorMessage: data.message ?? null,
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
    console.error('[CP3] Twilio credentials not set')
    return json({ error: 'Server misconfiguration: Twilio credentials not set' }, 500)
  }
  console.log('[CP3] Twilio credentials ok')

  // ── [CP4] Fetch eligible vendors ──────────────────────────────────────────
  const { data: vendors, error: vendorErr } = await supabase
    .from('vendors')
    .select('id, name, timezone, sentiment_delay_hours, twilio_phone_number')
    .eq('onboarding_complete', true)
    .not('twilio_phone_number', 'is', null)

  if (vendorErr) {
    console.error('[CP4] vendor fetch failed:', vendorErr.message)
    return json({ error: 'Failed to fetch vendors', details: vendorErr.message }, 500)
  }

  console.log(`[CP4] ${vendors?.length ?? 0} eligible vendor(s)`)

  // ── [CP5] Process each vendor ─────────────────────────────────────────────
  let totalSmsSent   = 0
  let totalSmsFailed = 0

  for (const vendor of vendors ?? []) {
    const today = getTodayInZone(vendor.timezone)
    console.log(`[CP5] vendor ${vendor.id} (${vendor.name}), today=${today}`)

    // ── Fetch locations due for sentiment ────────────────────────────────────
    const { data: locations, error: locErr } = await supabase
      .from('locations')
      .select('id, date, end_time')
      .eq('vendor_id', vendor.id)
      .eq('date', today)
      .eq('morning_sms_sent', true)
      .eq('sentiment_sms_sent', false)

    if (locErr) {
      console.error(`[CP5] location fetch failed for vendor ${vendor.id}:`, locErr.message)
      continue
    }

    const dueLocations = (locations ?? []).filter(loc => isSentimentDue(loc, vendor))

    if (dueLocations.length === 0) {
      console.log(`[CP5] no locations due for sentiment for vendor ${vendor.id}`)
      continue
    }

    console.log(`[CP5] ${dueLocations.length} location(s) due for sentiment`)

    // ── Fetch idle subscribers (don't interrupt active conversations) ─────────
    const { data: idleStates, error: stateErr } = await supabase
      .from('subscriber_sms_state')
      .select('subscriber_id')
      .eq('vendor_id', vendor.id)
      .eq('current_state', 'idle')

    if (stateErr) {
      console.error(`[CP5] sms state fetch failed for vendor ${vendor.id}:`, stateErr.message)
      continue
    }

    const idleSubscriberIds = (idleStates ?? []).map(s => s.subscriber_id)

    if (idleSubscriberIds.length === 0) {
      console.log(`[CP5] no idle subscribers for vendor ${vendor.id} — marking locations sent`)
      const ids = dueLocations.map(l => l.id)
      await supabase.from('locations').update({ sentiment_sms_sent: true }).in('id', ids)
      continue
    }

    const { data: subscribers, error: subErr } = await supabase
      .from('subscribers')
      .select('id, phone_number')
      .eq('vendor_id', vendor.id)
      .eq('is_active', true)
      .in('id', idleSubscriberIds)

    if (subErr) {
      console.error(`[CP5] subscriber fetch failed for vendor ${vendor.id}:`, subErr.message)
      continue
    }

    if (!subscribers || subscribers.length === 0) {
      console.log(`[CP5] no active idle subscribers for vendor ${vendor.id}`)
      const ids = dueLocations.map(l => l.id)
      await supabase.from('locations').update({ sentiment_sms_sent: true }).in('id', ids)
      continue
    }

    console.log(`[CP5] sending sentiment to ${subscribers.length} subscriber(s)`)

    // ── Build sentiment message ───────────────────────────────────────────────
    const smsBody = `How was your visit to ${vendor.name} today? Reply YES if you loved it or NO if it could be better 🌮`

    // ── Send to each idle subscriber ─────────────────────────────────────────
    // Use first due location id for sms_log (if there's somehow more than one due at once, use null)
    const logLocationId = dueLocations.length === 1 ? dueLocations[0].id : null

    for (const subscriber of subscribers) {
      let sendOk   = false
      let twilioSid: string | null = null

      try {
        const result = await sendTwilioSms(
          twilioAccountSid,
          twilioAuthToken,
          vendor.twilio_phone_number,
          subscriber.phone_number,
          smsBody,
        )
        sendOk    = result.ok
        twilioSid = result.sid
        if (!result.ok) {
          console.error(`[CP5] Twilio send failed for subscriber ${subscriber.id}:`, result.errorMessage)
        }
      } catch (err) {
        console.error(`[CP5] Twilio request threw for subscriber ${subscriber.id}:`, err.message)
      }

      // Log every attempt regardless of outcome
      await supabase.from('sms_log').insert({
        vendor_id:          vendor.id,
        subscriber_id:      subscriber.id,
        phone_number:       subscriber.phone_number,
        message_body:       smsBody,
        direction:          'outbound',
        message_type:       'sentiment_ask',
        twilio_message_sid: twilioSid,
        status:             sendOk ? 'sent' : 'failed',
        location_id:        logLocationId,
      })

      if (sendOk) {
        // Transition subscriber to awaiting_sentiment
        await supabase
          .from('subscriber_sms_state')
          .update({ current_state: 'awaiting_sentiment', updated_at: new Date().toISOString() })
          .eq('vendor_id', vendor.id)
          .eq('subscriber_id', subscriber.id)

        // Record when we last asked for sentiment
        await supabase
          .from('subscribers')
          .update({ last_sentiment_sent_at: new Date().toISOString() })
          .eq('id', subscriber.id)

        totalSmsSent++
      } else {
        totalSmsFailed++
      }
    }

    // ── Mark all due locations as sentiment sent ───────────────────────────────
    const locationIds = dueLocations.map(l => l.id)
    const { error: markErr } = await supabase
      .from('locations')
      .update({ sentiment_sms_sent: true })
      .in('id', locationIds)

    if (markErr) {
      console.error(`[CP5] failed to mark locations sentiment_sms_sent for vendor ${vendor.id}:`, markErr.message)
    } else {
      console.log(`[CP5] marked ${locationIds.length} location(s) as sentiment_sms_sent`)
    }
  }

  console.log(`[CP5] done — sent: ${totalSmsSent}, failed: ${totalSmsFailed}`)

  return json({
    success:           true,
    vendors_processed: (vendors ?? []).length,
    sms_sent:          totalSmsSent,
    sms_failed:        totalSmsFailed,
  })
})
