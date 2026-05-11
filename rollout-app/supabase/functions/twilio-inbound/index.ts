// @ts-nocheck — Deno runtime file, not processed by Node/browser TypeScript

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Constants ─────────────────────────────────────────────────────────────────

const STOP_KEYWORDS  = new Set(['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit'])
const START_KEYWORDS = new Set(['start', 'unstop'])

// First-word match for sentiment — covers the most common natural replies
const POSITIVE_WORDS = new Set(['1', 'yes', 'y', 'good', 'great', 'amazing', 'love', 'loved', 'awesome', 'excellent', 'fantastic', 'perfect', 'happy', '👍'])
const NEGATIVE_WORDS = new Set(['2', 'no', 'n', 'bad', 'terrible', 'poor', 'awful', 'horrible', 'disappointed', 'worst', 'unhappy', '👎'])

// ── Helpers ───────────────────────────────────────────────────────────────────

function twiml(message: string): string {
  const safe = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe}</Message></Response>`
}

function twimlEmpty(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`
}

const XML = { 'Content-Type': 'text/xml' }

// ── Operator command handler ───────────────────────────────────────────────────

// Returns today's date in YYYY-MM-DD in the vendor's timezone.
function todayInTz(timezone: string): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: timezone })
}

// Parses "11am", "11:30am", "2pm", "2:30pm" → "HH:MM" 24h string or null.
function parseTime(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i)
  if (!m) return null
  let h = parseInt(m[1], 10)
  const min = m[2] ? parseInt(m[2], 10) : 0
  const period = m[3].toLowerCase()
  if (period === 'am' && h === 12) h = 0
  if (period === 'pm' && h !== 12) h += 12
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

// Extracts the first two time tokens from a string.
// Returns { start, end, remaining } where remaining is the string with times removed.
function extractTimes(body: string): { start: string; end: string; remaining: string } | null {
  // Match patterns like: 11am, 11:30am, 2pm — with optional dash/space separator between pairs
  const timeRe = /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/gi
  const matches = [...body.matchAll(timeRe)]
  if (matches.length < 2) return null

  const start = parseTime(matches[0][1])
  const end   = parseTime(matches[1][1])
  if (!start || !end) return null

  // Remove the matched time tokens (and any separator between them) from the body
  let remaining = body
  // Remove from last match first to preserve indices
  for (let i = matches.length - 1; i >= 0; i--) {
    const idx = matches[i].index!
    const len = matches[i][0].length
    remaining = remaining.slice(0, idx) + remaining.slice(idx + len)
  }
  // Clean up leftover separators (dashes, "to", extra spaces)
  remaining = remaining.replace(/\s*[-–]\s*|\bto\b/gi, ' ').replace(/\s+/g, ' ').trim()

  return { start, end, remaining }
}

// Forward geocode an address string via OpenStreetMap Nominatim.
// Returns { lat, lng } or null on failure.
async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`
    const res  = await fetch(url, { headers: { 'User-Agent': 'Rollout-SaaS/1.0' } })
    const data = await res.json()
    if (!data?.[0]) return null
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch {
    return null
  }
}

async function handleOperatorCommand(body: string, vendor: any, db: any): Promise<Response> {
  const cmd = body.trim().toUpperCase()

  // ── HELP ──────────────────────────────────────────────────────────────────
  if (cmd === 'HELP') {
    const reply = [
      'Rollout commands:',
      '• [address] [start]-[end] — add today\'s location',
      '  e.g. Downtown Plaza 11am-2pm',
      '• STATUS — today\'s schedule + subscriber count',
      '• HELP — show this list',
    ].join('\n')
    return new Response(twiml(reply), { status: 200, headers: XML })
  }

  // ── STATUS ────────────────────────────────────────────────────────────────
  if (cmd === 'STATUS') {
    const today = todayInTz(vendor.timezone ?? 'America/Chicago')

    const [{ data: locs }, { count: subCount }] = await Promise.all([
      db.from('locations')
        .select('address, start_time, end_time')
        .eq('vendor_id', vendor.id)
        .eq('date', today)
        .order('start_time'),
      db.from('subscribers')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_id', vendor.id)
        .eq('is_active', true),
    ])

    let reply: string
    if (!locs || locs.length === 0) {
      reply = `No stops scheduled for today.\n\nActive subscribers: ${subCount ?? 0}\n\nText "[address] [start]-[end]" to add a stop.`
    } else {
      const stopLines = locs.map(l => {
        const fmt = (t: string) => {
          const [h, m] = t.split(':').map(Number)
          const ap = h >= 12 ? 'pm' : 'am'
          const hr = h % 12 || 12
          return m === 0 ? `${hr}${ap}` : `${hr}:${String(m).padStart(2, '0')}${ap}`
        }
        return `• ${l.address}, ${fmt(l.start_time)}–${fmt(l.end_time)}`
      }).join('\n')
      reply = `Today's stops:\n${stopLines}\n\nActive subscribers: ${subCount ?? 0}`
    }
    return new Response(twiml(reply), { status: 200, headers: XML })
  }

  // ── Location entry ────────────────────────────────────────────────────────
  const parsed = extractTimes(body)
  if (!parsed) {
    const reply = `Couldn't read the times. Try:\n\nDowntown Plaza 11am-2pm\n\nReply HELP for all commands.`
    return new Response(twiml(reply), { status: 200, headers: XML })
  }

  const { start, end, remaining: address } = parsed
  if (!address) {
    const reply = `Got the times but couldn't read the address. Try:\n\nDowntown Plaza 11am-2pm`
    return new Response(twiml(reply), { status: 200, headers: XML })
  }

  const today = todayInTz(vendor.timezone ?? 'America/Chicago')

  // Geocode in the background — don't block the reply on it
  const coords = await geocode(address)

  const { error: insertErr } = await db.from('locations').insert({
    vendor_id:  vendor.id,
    address:    address,
    date:       today,
    start_time: start,
    end_time:   end,
    lat:        coords?.lat ?? null,
    lng:        coords?.lng ?? null,
  })

  if (insertErr) {
    console.error('[OP] location insert failed:', insertErr.message)
    const reply = `Something went wrong saving that location. Try again or add it in the app.`
    return new Response(twiml(reply), { status: 200, headers: XML })
  }

  // Format times for confirmation reply
  const fmtTime = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    const ap = h >= 12 ? 'pm' : 'am'
    const hr = h % 12 || 12
    return m === 0 ? `${hr}${ap}` : `${hr}:${String(m).padStart(2, '0')}${ap}`
  }

  const reply = `Got it! Added for today:\n${address}\n${fmtTime(start)} – ${fmtTime(end)}\n\nSend another text to add a second stop.`
  return new Response(twiml(reply), { status: 200, headers: XML })
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok')

  try {
    // ── Validate Twilio signature ─────────────────────────────────────────────
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN') ?? ''
    const twilioSignature = req.headers.get('X-Twilio-Signature') ?? ''
    const url = req.url
    const bodyText = await req.text()
    const params = Object.fromEntries(new URLSearchParams(bodyText))

    // Compute expected signature: HMAC-SHA1 of (url + sorted params) with auth token
    const encoder = new TextEncoder()
    const keyData = encoder.encode(twilioAuthToken)
    const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
    let paramStr = url
    const sortedKeys = Object.keys(params).sort()
    for (const k of sortedKeys) paramStr += k + params[k]
    const sigData = encoder.encode(paramStr)
    const sigBuffer = await crypto.subtle.sign('HMAC', key, sigData)
    const expectedSig = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)))

    if (twilioSignature !== expectedSig) {
      return new Response('Forbidden', { status: 403 })
    }

    // ── Parse Twilio webhook fields from already-parsed params ────────────────
    const from   = params['From'] ?? ''
    const to     = params['To']   ?? ''
    const body   = (params['Body'] ?? '').trim()

    if (!from || !to || !body) {
      return new Response(twimlEmpty(), { status: 200, headers: XML })
    }

    // ── Init service role client ──────────────────────────────────────────────
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')
    if (!serviceRoleKey) {
      console.error('[twilio-inbound] SERVICE_ROLE_KEY not set')
      return new Response(twimlEmpty(), { status: 200, headers: XML })
    }
    const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey)

    // ── Look up vendor by To number ───────────────────────────────────────────
    const { data: vendor, error: vendorErr } = await db
      .from('vendors')
      .select('id, name, google_review_url, operator_phone_number, timezone')
      .eq('twilio_phone_number', to)
      .eq('onboarding_complete', true)
      .single()

    if (vendorErr || !vendor) {
      console.error('[twilio-inbound] vendor not found for number:', to, vendorErr?.message)
      return new Response(twimlEmpty(), { status: 200, headers: XML })
    }

    // ── STOP / START — highest priority, carrier compliance ───────────────────
    const firstWord = body.toLowerCase().split(/\s+/)[0]

    if (STOP_KEYWORDS.has(firstWord)) {
      await db.from('subscribers')
        .update({ is_active: false })
        .eq('vendor_id', vendor.id)
        .eq('phone_number', from)

      await db.from('sms_log').insert({
        vendor_id:    vendor.id,
        phone_number: from,
        message_body: body,
        direction:    'inbound',
        message_type: 'other',
        status:       'received',
      })

      // Empty TwiML — Twilio handles STOP reply at carrier level
      return new Response(twimlEmpty(), { status: 200, headers: XML })
    }

    if (START_KEYWORDS.has(firstWord)) {
      await db.from('subscribers')
        .update({ is_active: true })
        .eq('vendor_id', vendor.id)
        .eq('phone_number', from)

      await db.from('sms_log').insert({
        vendor_id:    vendor.id,
        phone_number: from,
        message_body: body,
        direction:    'inbound',
        message_type: 'other',
        status:       'received',
      })

      const reply = `Welcome back! You're subscribed to ${vendor.name} location updates again.`
      return new Response(twiml(reply), { status: 200, headers: XML })
    }

    // ── Operator command — checked before subscriber lookup ───────────────────
    if (vendor.operator_phone_number && from === vendor.operator_phone_number) {
      return handleOperatorCommand(body, vendor, db)
    }

    // ── Look up subscriber ────────────────────────────────────────────────────
    const { data: subscriber, error: subErr } = await db
      .from('subscribers')
      .select('id, is_active')
      .eq('vendor_id', vendor.id)
      .eq('phone_number', from)
      .single()

    if (subErr || !subscriber) {
      return new Response(twimlEmpty(), { status: 200, headers: XML })
    }

    if (!subscriber.is_active) {
      return new Response(twimlEmpty(), { status: 200, headers: XML })
    }

    // ── Look up SMS state ─────────────────────────────────────────────────────
    const { data: smsState, error: stateErr } = await db
      .from('subscriber_sms_state')
      .select('id, current_state, active_conversation_id')
      .eq('vendor_id', vendor.id)
      .eq('subscriber_id', subscriber.id)
      .single()

    if (stateErr || !smsState) {
      console.error('[twilio-inbound] sms state not found for subscriber:', subscriber.id, stateErr?.message)
      return new Response(twimlEmpty(), { status: 200, headers: XML })
    }

    // ── Route by state ────────────────────────────────────────────────────────

    let effectiveState = smsState.current_state
    let effectiveConversationId = smsState.active_conversation_id ?? null

    // ── awaiting_sentiment ────────────────────────────────────────────────────
    if (effectiveState === 'awaiting_sentiment') {
      const normalized = body.toLowerCase().trim()
      const isPositive = POSITIVE_WORDS.has(normalized)
      const isNegative = NEGATIVE_WORDS.has(normalized)

      if (isPositive || isNegative) {
        const sentiment = isPositive ? 'happy' : 'unhappy'

        // Record sentiment response
        await db.from('sentiment_responses').insert({
          vendor_id:     vendor.id,
          subscriber_id: subscriber.id,
          response:      sentiment,
          raw_reply:     body,
        })

        // Log inbound sentiment message
        await db.from('sms_log').insert({
          vendor_id:     vendor.id,
          subscriber_id: subscriber.id,
          phone_number:  from,
          message_body:  body,
          direction:     'inbound',
          message_type:  isPositive ? 'sentiment_happy' : 'sentiment_unhappy',
          status:        'received',
        })

        // Reset state to idle
        await db.from('subscriber_sms_state')
          .update({ current_state: 'idle', active_conversation_id: null, updated_at: new Date().toISOString() })
          .eq('id', smsState.id)

        // Build and send reply via TwiML
        let reply: string
        if (isPositive && vendor.google_review_url) {
          reply = `Thanks for the love! 🌮 Mind leaving us a quick review? ${vendor.google_review_url}`
        } else if (isPositive) {
          reply = `Thanks for the feedback! Glad you enjoyed it. 🌮`
        } else {
          reply = `Thanks for letting us know — we'll work on doing better next time.`
        }

        // Log outbound reply
        await db.from('sms_log').insert({
          vendor_id:     vendor.id,
          subscriber_id: subscriber.id,
          phone_number:  from,
          message_body:  reply,
          direction:     'outbound',
          message_type:  isPositive ? 'sentiment_happy' : 'sentiment_unhappy',
          status:        'sent',
        })

        return new Response(twiml(reply), { status: 200, headers: XML })
      }

      // Unrecognized sentiment reply — log it and treat as a conversation message
      await db.from('sms_log').insert({
        vendor_id:     vendor.id,
        subscriber_id: subscriber.id,
        phone_number:  from,
        message_body:  body,
        direction:     'inbound',
        message_type:  'sentiment_invalid',
        status:        'received',
      })

      // Transition to idle so conversation block creates a fresh thread
      await db.from('subscriber_sms_state')
        .update({ current_state: 'idle', active_conversation_id: null, updated_at: new Date().toISOString() })
        .eq('id', smsState.id)

      effectiveState          = 'idle'
      effectiveConversationId = null
    }

    // ── idle / in_conversation → route to inbox ───────────────────────────────
    let conversationId = effectiveConversationId

    // Verify existing conversation is still open
    if (conversationId) {
      const { data: existing } = await db
        .from('conversations')
        .select('id, status')
        .eq('id', conversationId)
        .single()

      if (!existing || existing.status === 'resolved') {
        conversationId = null  // Start a new thread
      }
    }

    // Create new conversation if needed
    if (!conversationId) {
      const { data: newConv, error: convErr } = await db
        .from('conversations')
        .insert({
          vendor_id:       vendor.id,
          subscriber_id:   subscriber.id,
          status:          'open',
          last_message_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (convErr || !newConv) {
        console.error('[twilio-inbound] failed to create conversation:', convErr?.message)
        return new Response(twimlEmpty(), { status: 200, headers: XML })
      }

      conversationId = newConv.id
    } else {
      // Bump last_message_at on existing conversation
      await db.from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId)
    }

    // Append inbound message to conversation
    await db.from('conversation_messages').insert({
      conversation_id: conversationId,
      body:            body,
      direction:       'inbound',
    })

    // Update subscriber state to in_conversation
    await db.from('subscriber_sms_state')
      .update({
        current_state:          'in_conversation',
        active_conversation_id: conversationId,
        updated_at:             new Date().toISOString(),
      })
      .eq('id', smsState.id)

    // Log inbound message
    await db.from('sms_log').insert({
      vendor_id:     vendor.id,
      subscriber_id: subscriber.id,
      phone_number:  from,
      message_body:  body,
      direction:     'inbound',
      message_type:  'idle_reply',
      status:        'received',
    })

    // No auto-reply: vendor responds via the Inbox UI (Module 9)
    return new Response(twimlEmpty(), { status: 200, headers: XML })

  } catch (err) {
    // Always 200 to Twilio — non-200 causes webhook retries and duplicate processing
    console.error('[twilio-inbound] unhandled error:', err.message)
    return new Response(twimlEmpty(), { status: 200, headers: XML })
  }
})
