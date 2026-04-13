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

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok')

  try {
    // ── [CP1] Parse Twilio webhook ────────────────────────────────────────────
    const text   = await req.text()
    const params = new URLSearchParams(text)
    const from   = params.get('From') ?? ''
    const to     = params.get('To')   ?? ''
    const body   = (params.get('Body') ?? '').trim()

    console.log(`[CP1] inbound SMS from=${from} to=${to} body="${body}"`)

    if (!from || !to || !body) {
      console.error('[CP1] missing required Twilio fields')
      return new Response(twimlEmpty(), { status: 200, headers: XML })
    }

    // ── [CP2] Init service role client ────────────────────────────────────────
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')
    if (!serviceRoleKey) {
      console.error('[CP2] SERVICE_ROLE_KEY not set')
      return new Response(twimlEmpty(), { status: 200, headers: XML })
    }
    const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey)
    console.log('[CP2] service role client ok')

    // ── [CP3] Look up vendor by To number ────────────────────────────────────
    const { data: vendor, error: vendorErr } = await db
      .from('vendors')
      .select('id, name, google_review_url')
      .eq('twilio_phone_number', to)
      .eq('onboarding_complete', true)
      .single()

    if (vendorErr || !vendor) {
      console.error('[CP3] vendor not found for number:', to, vendorErr?.message)
      return new Response(twimlEmpty(), { status: 200, headers: XML })
    }
    console.log(`[CP3] vendor: ${vendor.id} (${vendor.name})`)

    // ── [CP4] STOP / START — highest priority, carrier compliance ─────────────
    const firstWord = body.toLowerCase().split(/\s+/)[0]

    if (STOP_KEYWORDS.has(firstWord)) {
      console.log(`[CP4] STOP from ${from}`)
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
      console.log(`[CP4] START from ${from}`)
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

    // ── [CP5] Look up subscriber ──────────────────────────────────────────────
    const { data: subscriber, error: subErr } = await db
      .from('subscribers')
      .select('id, is_active')
      .eq('vendor_id', vendor.id)
      .eq('phone_number', from)
      .single()

    if (subErr || !subscriber) {
      console.log(`[CP5] no subscriber for ${from} — ignoring`)
      return new Response(twimlEmpty(), { status: 200, headers: XML })
    }

    if (!subscriber.is_active) {
      console.log(`[CP5] subscriber ${subscriber.id} is inactive — ignoring`)
      return new Response(twimlEmpty(), { status: 200, headers: XML })
    }

    console.log(`[CP5] subscriber: ${subscriber.id}`)

    // ── [CP6] Look up SMS state ───────────────────────────────────────────────
    const { data: smsState, error: stateErr } = await db
      .from('subscriber_sms_state')
      .select('id, current_state, active_conversation_id')
      .eq('vendor_id', vendor.id)
      .eq('subscriber_id', subscriber.id)
      .single()

    if (stateErr || !smsState) {
      console.error('[CP6] sms state not found for subscriber:', subscriber.id, stateErr?.message)
      return new Response(twimlEmpty(), { status: 200, headers: XML })
    }

    console.log(`[CP6] current state: ${smsState.current_state}`)

    // ── [CP7] Route by state ──────────────────────────────────────────────────

    let effectiveState = smsState.current_state
    let effectiveConversationId = smsState.active_conversation_id ?? null

    // ── awaiting_sentiment ────────────────────────────────────────────────────
    if (effectiveState === 'awaiting_sentiment') {
      const normalized = body.toLowerCase().trim()
      const isPositive = POSITIVE_WORDS.has(normalized)
      const isNegative = NEGATIVE_WORDS.has(normalized)

      if (isPositive || isNegative) {
        const sentiment = isPositive ? 'happy' : 'unhappy'
        console.log(`[CP7] sentiment: ${sentiment}`)

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
      console.log('[CP7] unrecognized sentiment reply — routing to conversation')
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
    console.log(`[CP7] conversation routing (effective state: ${effectiveState})`)

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
        console.error('[CP7] failed to create conversation:', convErr?.message)
        return new Response(twimlEmpty(), { status: 200, headers: XML })
      }

      conversationId = newConv.id
      console.log(`[CP7] created conversation: ${conversationId}`)
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

    console.log(`[CP7] message saved to conversation ${conversationId} — no auto-reply`)

    // No auto-reply: vendor responds via the Inbox UI (Module 9)
    return new Response(twimlEmpty(), { status: 200, headers: XML })

  } catch (err) {
    // Always 200 to Twilio — non-200 causes webhook retries and duplicate processing
    console.error('[twilio-inbound] unhandled error:', err.message)
    return new Response(twimlEmpty(), { status: 200, headers: XML })
  }
})
