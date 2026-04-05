# Rollout — API & Edge Functions
### Document 04

---

## Overview
Backend is handled by Supabase Edge Functions (Deno/TypeScript).
All authenticated endpoints validate the vendor's session via Supabase Auth JWT.
All responses return JSON.

---

## Edge Functions

---

### POST /functions/v1/onboarding-complete
**Purpose:** Mark vendor onboarding as complete, provision Twilio number
**Auth:** Required
**Body:**
```json
{
  "vendor_id": "uuid"
}
```
**Logic:**
1. Verify vendor belongs to authenticated user
2. Provision a Twilio phone number for this vendor (buy from available pool)
3. Store twilio_phone_number and twilio_phone_sid on vendors row
4. Set onboarding_complete = true
5. Return success

**Response:**
```json
{
  "success": true,
  "twilio_phone_number": "+15205551234"
}
```
**Errors:**
- 401 — Not authenticated
- 403 — Vendor does not belong to user
- 500 — Twilio provisioning failed

---

### POST /functions/v1/subscriber-optin
**Purpose:** Handle customer opt-in from QR code landing page
**Auth:** None (public endpoint)
**Body:**
```json
{
  "vendor_slug": "tacos-el-rey",
  "phone_number": "+15205551234"
}
```
**Logic:**
1. Look up vendor by slug
2. Validate phone number format (E.164)
3. Check if subscriber already exists for this vendor + phone combo
4. If new: insert into subscribers, set state to 'idle' in subscriber_sms_state, send confirmation SMS via Twilio
5. If existing: return already_subscribed = true, do NOT send SMS
6. Return result

**Response (new):**
```json
{
  "success": true,
  "already_subscribed": false
}
```
**Response (existing):**
```json
{
  "success": true,
  "already_subscribed": true
}
```
**Errors:**
- 404 — Vendor slug not found
- 422 — Invalid phone number format
- 500 — SMS send failed (still creates subscriber, logs error)

---

### POST /functions/v1/twilio-inbound
**Purpose:** Twilio webhook — handle all inbound SMS replies
**Auth:** Twilio signature validation (not user auth)
**Body:** Twilio standard webhook payload
```
From: +15205551234
To: +15205559999 (vendor's Twilio number)
Body: "1"
```
**Logic:**
1. Validate Twilio signature header
2. Look up vendor by the "To" number (twilio_phone_number)
3. Look up subscriber by vendor_id + From number
4. If subscriber not found → send "Sorry, we don't recognize your number. Text your truck's keyword to subscribe."
5. Look up subscriber_sms_state for this vendor + subscriber
6. Route based on current_state:

   **State: 'awaiting_sentiment'**
   - If body is '1' or '1.' or 'yes' or 'good' → happy path
     - Insert sentiment_response (happy)
     - Send Google review nudge SMS
     - Update subscriber_sms_state to 'idle'
     - Update last_sentiment_sent_at on subscriber
   - If body is '2' or '2.' or 'no' or 'bad' → unhappy path
     - Insert sentiment_response (unhappy)
     - Create new conversation row
     - Insert first conversation_message (inbound, their reply)
     - Send empathy SMS + ask what happened
     - Update subscriber_sms_state to 'in_conversation' with active_conversation_id
   - If body is anything else → send "Reply 1 if great, 2 if something was off 🌮"

   **State: 'in_conversation'**
   - Insert message into conversation_messages (inbound)
   - Update conversations.last_message_at
   - Send push notification to vendor (Supabase realtime event)
   - Do NOT auto-reply (vendor handles from here)

   **State: 'idle'**
   - If body is 'STOP' → set subscriber is_active = false, Twilio handles opt-out compliance automatically
   - If body is anything else → send "You're subscribed to [Truck Name] location updates. Reply STOP to unsubscribe."

7. Log all messages to sms_log
8. Return 200 TwiML response

**Errors:**
- 403 — Invalid Twilio signature
- Always return 200 to Twilio (even on errors, to prevent retries)

---

### POST /functions/v1/send-vendor-reply
**Purpose:** Vendor sends a message to a customer from the inbox
**Auth:** Required
**Body:**
```json
{
  "conversation_id": "uuid",
  "message": "Hi! So sorry about that — come back and your next taco is on us."
}
```
**Logic:**
1. Verify conversation belongs to authenticated vendor
2. Get subscriber phone number from conversation → subscriber
3. Send SMS via vendor's Twilio number
4. Insert into conversation_messages (outbound)
5. Update conversations.last_message_at
6. Log to sms_log
7. Return success

**Response:**
```json
{ "success": true }
```
**Errors:**
- 401 — Not authenticated
- 403 — Conversation does not belong to vendor
- 500 — Twilio send failed

---

### POST /functions/v1/resolve-conversation
**Purpose:** Mark a conversation as resolved
**Auth:** Required
**Body:**
```json
{
  "conversation_id": "uuid"
}
```
**Logic:**
1. Verify conversation belongs to vendor
2. Update conversations.status = 'resolved'
3. Update subscriber_sms_state to 'idle'
4. Return success

---

### POST /functions/v1/add-location
**Purpose:** Create a new location event
**Auth:** Required
**Body:**
```json
{
  "vendor_id": "uuid",
  "address": "123 Main St, Tucson AZ",
  "lat": 32.2226,
  "lng": -110.9747,
  "date": "2026-04-10",
  "start_time": "11:00",
  "end_time": "14:00",
  "notes": "Limited menu today",
  "is_recurring": false,
  "recurrence_rule": null
}
```
**Logic:**
1. Verify vendor belongs to user
2. Check subscriber count — if 0, still allow (just no SMS will fire)
3. Insert into locations
4. If is_recurring, generate future location rows (next 8 weeks)
5. Return location

**Response:**
```json
{
  "success": true,
  "location": { ...location row }
}
```

---

### DELETE /functions/v1/delete-location
**Purpose:** Delete a location event
**Auth:** Required
**Body:**
```json
{
  "location_id": "uuid",
  "delete_recurring": false
}
```
**Logic:**
1. Verify location belongs to vendor
2. If morning_sms_sent = true → cannot delete (already notified customers), return error
3. If delete_recurring = true → delete all future instances of this recurrence
4. Delete location row
5. Return success

**Errors:**
- 409 — Cannot delete location after morning SMS has already been sent

---

### GET /functions/v1/dashboard-stats
**Purpose:** Fetch all stats for dashboard overview cards
**Auth:** Required
**Query params:** `vendor_id`
**Logic:**
1. Verify vendor belongs to user
2. Query:
   - Total active subscribers
   - New subscribers this week
   - Locations this week count
   - Sentiment score last 30 days (happy / total * 100)
   - Reviews driven (count of happy sentiment responses in last 30 days)
   - Open conversation count
3. Return all stats in one response

**Response:**
```json
{
  "total_subscribers": 243,
  "new_subscribers_this_week": 12,
  "locations_this_week": 4,
  "sentiment_score": 87,
  "reviews_driven": 34,
  "open_conversations": 2
}
```

---

### POST /functions/v1/create-checkout-session
**Purpose:** Create Stripe checkout session for plan upgrade
**Auth:** Required
**Body:**
```json
{
  "plan_name": "pro",
  "billing_interval": "monthly"
}
```
**Logic:**
1. Get or create Stripe customer for this vendor
2. Create Stripe checkout session with correct price_id
3. Return checkout URL

**Response:**
```json
{
  "checkout_url": "https://checkout.stripe.com/..."
}
```

---

### POST /functions/v1/stripe-webhook
**Purpose:** Handle Stripe subscription lifecycle events
**Auth:** Stripe signature validation
**Events handled:**
- `checkout.session.completed` → activate subscription, set status = 'active', store stripe_subscription_id
- `customer.subscription.updated` → update plan, status, period end
- `customer.subscription.deleted` → set status = 'canceled', restrict features
- `invoice.payment_failed` → set status = 'past_due', send vendor email alert
- `invoice.payment_succeeded` → update current_period_ends_at
- `customer.subscription.trial_will_end` → send vendor email (3 days before trial ends)

---

## Scheduled Edge Functions (Cron Jobs)

---

### morning-notifications (runs daily 7:45 AM UTC-adjusted per vendor timezone)
**Purpose:** Send morning location SMS to all subscribers
**Logic:**
```
for each vendor:
  get vendor's notification_time and timezone
  if current time in vendor's timezone is within 15 min of notification_time:
    get today's locations for this vendor where morning_sms_sent = false
    for each location:
      get all active subscribers for this vendor
      for each subscriber:
        send SMS: "🚨 [Truck Name] is rolling out today! [Address] [Start]-[End]. Come find us 🌮"
        log to sms_log
      set location.morning_sms_sent = true
```

---

### sentiment-dispatcher (runs every 30 minutes)
**Purpose:** Fire post-visit sentiment SMS to eligible subscribers
**Logic:**
```
get all locations where:
  end_time + sentiment_delay_hours <= now()
  AND sentiment_sms_sent = false

for each location:
  get vendor
  get all active subscribers for this vendor where:
    opted_in_at <= now() - 24 hours (subscribed for at least 24hrs)
    AND (last_sentiment_sent_at IS NULL OR last_sentiment_sent_at <= now() - 7 days)
    AND current state in subscriber_sms_state = 'idle' (not mid-conversation)
  
  for each eligible subscriber:
    send SMS: "Hey! How was [Truck Name] today? Reply 1 if we nailed it, reply 2 if something was off 🌮"
    update subscriber_sms_state.current_state = 'awaiting_sentiment'
    log to sms_log (type: 'sentiment_ask', location_id: location.id)
  
  set location.sentiment_sms_sent = true
```

---

## SMS Message Templates

| Type | Template |
|---|---|
| opt_in_confirm | "You're on [NAME]'s list! We'll text you our locations so you never miss us. Reply STOP anytime." |
| location_notify | "🚨 [NAME] is rolling out today! [ADDRESS] from [START]–[END]. Come find us 🌮" |
| sentiment_ask | "Hey! How was [NAME] today? Reply 1 if we nailed it, reply 2 if something was off 🌮" |
| sentiment_happy | "So glad you loved it! Would mean the world if you left us a quick review 🙏 [REVIEW_URL]" |
| sentiment_unhappy | "Sorry to hear that — [OWNER] wants to make it right. What happened?" |
| sentiment_invalid | "Reply 1 if everything was great, or 2 if something was off 🌮" |
| idle_reply | "You're subscribed to [NAME] location updates. Reply STOP to unsubscribe." |
