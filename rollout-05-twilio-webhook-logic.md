# Rollout — Twilio Webhook Logic & SMS State Machine
### Document 05

---

## Overview
Every inbound SMS from a customer hits the same Twilio webhook endpoint.
The system must determine what the customer is replying to and route accordingly.
This is managed via the `subscriber_sms_state` table which tracks each subscriber's current context.

---

## State Machine

```
States:
  idle             — no pending reply, just a subscriber
  awaiting_sentiment — we sent them a "1 or 2" sentiment question
  in_conversation  — they replied unhappy, active complaint thread open
```

---

## Full Inbound Routing Flow

```
INBOUND SMS RECEIVED
        │
        ▼
Validate Twilio signature
        │
        ├── FAIL → return 403
        │
        ▼
Look up vendor by "To" phone number
        │
        ├── NOT FOUND → ignore (wrong number, shouldn't happen)
        │
        ▼
Look up subscriber by vendor_id + "From" phone number
        │
        ├── NOT FOUND →
        │     Send: "Sorry, we don't recognize your number."
        │     Return 200
        │
        ▼
Check if subscriber is_active = false (opted out)
        │
        ├── TRUE → Twilio handles STOP compliance automatically
        │           Do nothing, return 200
        │
        ▼
Look up subscriber_sms_state
        │
        ├── NOT FOUND → treat as 'idle' (create idle state row)
        │
        ▼
Route based on current_state:

═══════════════════════════════════════
STATE: awaiting_sentiment
═══════════════════════════════════════
        │
        ├── Reply is HAPPY (1, "1", "1.", "yes", "good", "great", "loved it")
        │     → Insert sentiment_response (happy)
        │     → Send sentiment_happy SMS (Google review nudge)
        │     → Update subscriber_sms_state → 'idle'
        │     → Update subscriber.last_sentiment_sent_at = now()
        │     → Log to sms_log
        │     → Return 200
        │
        ├── Reply is UNHAPPY (2, "2", "2.", "no", "bad", "not good")
        │     → Insert sentiment_response (unhappy)
        │     → Create conversation row (status: open)
        │     → Insert conversation_message (inbound, their "2" reply)
        │     → Send sentiment_unhappy SMS ("Sorry... what happened?")
        │     → Update subscriber_sms_state → 'in_conversation'
        │         with active_conversation_id = new conversation id
        │     → Update subscriber.last_sentiment_sent_at = now()
        │     → Emit Supabase realtime event to vendor dashboard
        │     → Log to sms_log
        │     → Return 200
        │
        └── Reply is ANYTHING ELSE
              → Send sentiment_invalid SMS ("Reply 1 if great, 2 if off 🌮")
              → Do NOT change state (still awaiting_sentiment)
              → Return 200

═══════════════════════════════════════
STATE: in_conversation
═══════════════════════════════════════
        │
        ├── Reply is STOP
        │     → Set subscriber.is_active = false
        │     → Update subscriber_sms_state → 'idle'
        │     → Twilio handles compliance response automatically
        │     → Return 200
        │
        └── Reply is ANYTHING ELSE (complaint message, follow-up)
              → Insert conversation_message (inbound)
              → Update conversation.last_message_at = now()
              → Emit Supabase realtime event to vendor dashboard
              → Log to sms_log
              → Do NOT auto-reply (vendor handles from inbox)
              → Return 200

═══════════════════════════════════════
STATE: idle
═══════════════════════════════════════
        │
        ├── Reply is STOP
        │     → Set subscriber.is_active = false
        │     → Twilio handles compliance response automatically
        │     → Return 200
        │
        └── Reply is ANYTHING ELSE
              → Send idle_reply SMS ("You're subscribed to [NAME]...")
              → Return 200
```

---

## Happy Path Detection
Be liberal with what counts as "happy" to maximize review conversions.
Normalize inbound text: lowercase, trim whitespace, remove punctuation.

**Happy triggers:** `1`, `yes`, `good`, `great`, `loved`, `amazing`, `awesome`, `perfect`, `nailed`
**Unhappy triggers:** `2`, `no`, `bad`, `terrible`, `awful`, `wrong`, `off`, `disappointed`, `gross`
**Default:** If not in either list and state is awaiting_sentiment → send invalid reply, stay in state

---

## Twilio Number Provisioning
Each vendor gets their own Twilio phone number.
This ensures inbound replies route back to the correct vendor.

**On vendor onboarding complete:**
1. Call Twilio API to search available local numbers (area code matching vendor's city if possible)
2. Purchase number
3. Configure number's webhook URL → `https://[project].supabase.co/functions/v1/twilio-inbound`
4. Store phone_number + SID on vendor row

**Cost:** ~$1.15/month per Twilio number (factored into plan pricing)

---

## Twilio Signature Validation
Every inbound request from Twilio must be validated.

```typescript
import twilio from 'twilio';

const validateTwilioSignature = (
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>
): boolean => {
  return twilio.validateRequest(authToken, signature, url, params);
};
```

If validation fails → return 403, log the attempt.

---

## Compliance Notes
- STOP handling is managed by Twilio automatically — never override STOP responses
- All outbound messages must include opt-out language on confirmation SMS
- Message frequency disclosure on opt-in page ("Msg frequency varies")
- "Msg & data rates may apply" on opt-in page
- Maintain STOP/HELP keyword handling at all times
- Never send marketing SMS to opted-out numbers — check is_active before any send
