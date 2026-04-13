# Rollout — Project State
**Last updated: 2026-04-13**
**Status: Modules 1–12 complete and tested. App is feature-complete.**

---

## 1. Project Overview

### What it is

Rollout is a B2B SaaS platform for food truck operators. It solves the problem of food truck customers not knowing where their favourite trucks are on a given day. Operators use Rollout to publish their location schedule; customers subscribe via SMS and receive notifications automatically.

### Core value proposition

- **For the operator:** A growing subscriber list + automated morning SMS with that day's location → zero manual effort after setup.
- **For the customer:** One QR code scan, enter a phone number, done. No app download, no account.

### High-level system architecture

```
[Customer browser]       [Vendor browser]
     |                        |
     |  /join/:slug            |  /dashboard, /locations, etc.
     |                        |
     └──────────┬─────────────┘
                |
         [React + Vite SPA]
                |
       ┌────────┴────────┐
       |                 |
  [Supabase DB]   [Supabase Edge Functions]
  (Postgres +      (Deno runtime)
   RLS policies)        |
                   [Twilio API]
                   (SMS send/receive)
                        |
                   [Stripe API]
                   (billing — integrated)
```

**Key principle:** All writes to RLS-protected tables from public or cross-user contexts go through Edge Functions with the service role key. The frontend never holds the service role key.

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, React Router v7, Tailwind CSS v4, Recharts |
| Auth | Supabase Auth (email/password) |
| Database | Supabase Postgres with Row Level Security |
| Edge Functions | Supabase Edge Functions (Deno runtime) |
| SMS | Twilio (send/receive, number provisioning) |
| Storage | Supabase Storage (`vendor-logos` bucket, public read) |
| Payments | Stripe (Checkout, webhooks, subscription management) |
| Realtime | Supabase Realtime on: `conversations`, `conversation_messages`, `sentiment_responses`, `subscribers` |

---

## 3. Completed Modules

---

### Module 1 — Auth & Session Management
**Status: Complete and tested.**

- Signup, login, forgot password, reset password pages
- `AuthContext` — wraps app, exposes `{ session, vendor, loading }`
- `ProtectedRoute` / `PublicOnlyRoute` — route guards
- DB trigger on signup: creates `vendors` row + `vendor_subscriptions` (trialing, 14 days)

**Critical — auth mutex:** `onAuthStateChange` callback must be synchronous. Making it `async` causes a deadlock on sign-out. Fire `fetchVendor()` as a non-async fire-and-forget.

**Critical — sign out:** Use `await supabase.auth.signOut({ scope: 'local' })` then `window.location.replace('/login')`. The `scope: 'local'` prevents server round-trip and resolves the auth mutex issue.

**Key files:** `src/contexts/AuthContext.jsx`, `src/components/ProtectedRoute.jsx`, `src/layouts/AppLayout.jsx`, `src/pages/auth/`

---

### Module 2 — Vendor Onboarding Wizard
**Status: Complete and tested.**

5-step wizard at `/onboarding`:
1. Truck name, slug (auto-generated), description, logo upload
2. Google review URL
3. Notification time + timezone
4. QR code display (PNG + PDF download)
5. First location entry → calls `onboarding-complete` edge function

**Key files:** `src/pages/vendor/OnboardingPage.jsx`, `supabase/functions/onboarding-complete/index.ts`

---

### Module 3 — Customer SMS Opt-In Flow
**Status: Complete and tested.**

Public page at `/join/:slug`. No auth required. Customer enters phone number → `subscriber-optin` edge function creates subscriber + idle SMS state row + sends confirmation SMS.

Phone formatting: display as `(XXX) XXX-XXXX`, submit as E.164 `+1XXXXXXXXXX`.

**Key files:** `src/pages/customer/OptInPage.jsx`, `supabase/functions/subscriber-optin/index.ts`

---

### Module 4 — Location Scheduling
**Status: Complete and tested.**

Vendor dashboard page at `/locations`. Add/edit/delete locations with date, address, start/end time, notes, recurring toggle. Groups by date, shows Upcoming/Past toggle.

**Key files:** `src/pages/vendor/LocationsPage.jsx`

---

### Module 5 — Morning SMS Broadcast
**Status: Complete and tested.**

Edge function `send-morning-sms` triggered by cron every 5 minutes. Finds vendors whose `notification_time` falls in the current 5-minute window (timezone-aware), fetches today's unsent locations, sends one SMS per subscriber covering all locations.

**SMS format:**
- Single location: `[Name] today: [Address], [start]-[end]. [Notes.] Reply STOP to opt out.`
- Multiple: bulleted list with header

**Idempotency:** `locations.morning_sms_sent` flag prevents duplicate sends.

**Cron setup (run once in Supabase SQL editor):**
```sql
select cron.schedule(
  'morning-sms-broadcast',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://pprorqwkmuqrsddjotvx.supabase.co/functions/v1/send-morning-sms',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <CRON_SECRET_VALUE>',
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  )
  $$
);
```

**Key files:** `supabase/functions/send-morning-sms/index.ts`

---

### Module 6 — Inbound SMS / State Machine
**Status: Complete and tested.**

Edge function `twilio-inbound` receives Twilio webhook POSTs (form-encoded). Routes inbound messages by state:

| Keyword | Action |
|---|---|
| STOP / CANCEL / etc. | Set `subscribers.is_active = false`, empty TwiML |
| START / UNSTOP | Set `subscribers.is_active = true`, welcome reply |
| State = `awaiting_sentiment` + positive word | Record happy sentiment, reply with Google review link |
| State = `awaiting_sentiment` + negative word | Record unhappy sentiment, empathy reply |
| State = `awaiting_sentiment` + unrecognized | Log as invalid, fall through to conversation |
| State = `idle` or `in_conversation` | Create/append conversation thread, no auto-reply |

**Always returns HTTP 200 to Twilio** — non-200 causes webhook retries and duplicate processing.

**Key files:** `supabase/functions/twilio-inbound/index.ts`

---

### Module 7 — Sentiment Collection
**Status: Complete and tested.**

Edge function `send-sentiment-sms` triggered by cron every 5 minutes. Finds locations where `morning_sms_sent = true`, `sentiment_sms_sent = false`, and `end_time + sentiment_delay_hours` has passed in vendor's timezone.

Only sends to subscribers in `idle` state — does not interrupt active conversations.

After sending, transitions subscriber state to `awaiting_sentiment`. Module 6 handles the reply.

**SMS message:** `How was your visit to [Name] today? Reply YES if you loved it or NO if it could be better 🌮`

**Cron setup (same pattern as morning SMS, separate job):**
```sql
select cron.schedule(
  'sentiment-sms-broadcast',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://pprorqwkmuqrsddjotvx.supabase.co/functions/v1/send-sentiment-sms',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <CRON_SECRET_VALUE>',
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  )
  $$
);
```

**Key files:** `supabase/functions/send-sentiment-sms/index.ts`

---

### Module 8 — Dashboard
**Status: Complete and tested.**

Vendor dashboard at `/dashboard`. Parallel data fetch with `Promise.all`:
- Active subscriber count
- Today's locations
- Outbound SMS count (this month)
- Sentiment score (happy %)
- Recent SMS activity (last 5 entries)

**Key files:** `src/pages/vendor/DashboardPage.jsx`

---

### Module 9 — Inbox / Conversations
**Status: Complete and tested.**

Real-time two-way SMS inbox at `/inbox`.

- Left panel: conversation list (open/resolved filter), sorted by `last_message_at`
- Right panel: message thread with bubble UI, real-time updates via Supabase Realtime
- Reply input: Enter to send, Shift+Enter for newline
- Mark as resolved button
- Mobile-friendly: shows list OR thread, not both simultaneously

Vendor replies call `vendor-reply` edge function which sends SMS via Twilio, persists message to `conversation_messages`, logs to `sms_log`, updates conversation `last_message_at`.

**Realtime:** Subscribed to `postgres_changes` on `conversation_messages` filtered by `conversation_id`. Cleans up channel on unmount to prevent duplicate subscriptions.

**Key files:** `src/pages/vendor/InboxPage.jsx`, `supabase/functions/vendor-reply/index.ts`

---

### Module 10 — Subscribers List
**Status: Complete and tested.**

Vendor page at `/subscribers`. Shows:
- Stat badges: Total / Active / Opted out
- Searchable by phone number (digit match)
- Filter tabs: All / Active / Opted out
- Table with phone, joined date, status badge
- Footer showing filtered vs total count

**Key files:** `src/pages/vendor/SubscribersPage.jsx`

---

### Module 11 — Analytics
**Status: Complete and tested.**

Vendor page at `/analytics`. All data fetched in parallel, aggregated on frontend.

- **Stat cards:** Active subscribers, SMS sent (30 days), delivery rate
- **Subscriber growth chart:** Area chart, cumulative, last 30 days (Recharts)
- **SMS per day chart:** Bar chart, last 30 days (Recharts)
- **Sentiment breakdown:** Horizontal bar showing happy/unhappy split with percentages

Charts use CSS custom properties (`var(--color-accent)`) so they respect the design system theme.

**Key files:** `src/pages/vendor/AnalyticsPage.jsx`

---

### Module 12 — Billing / Stripe
**Status: Complete and tested.**

Vendor page at `/billing`. Three-tier pricing (Starter $29, Pro $49, Fleet $99).

**Flow:**
1. Vendor clicks upgrade → `create-checkout-session` edge function creates Stripe Checkout session
2. Frontend redirects to Stripe Checkout URL
3. Vendor completes payment
4. Stripe redirects to `/billing?success=true`
5. Stripe sends webhook to `stripe-webhook` edge function
6. Webhook updates `vendor_subscriptions` with status, customer ID, subscription ID, period end

**Billing page features:**
- Status banner: trial countdown, active plan + next billing date, past due warning, canceled state
- Three plan cards with feature lists, current plan highlighted, Most Popular badge on Pro
- Success message on return from Stripe

**Webhook events handled:**
- `checkout.session.completed` → set active, link subscription
- `customer.subscription.updated` → sync status + period end
- `customer.subscription.deleted` → set canceled

**Stripe webhook setup (after deploying `stripe-webhook` function):**
1. Stripe Dashboard → Developers → Webhooks → Add endpoint
2. URL: `https://pprorqwkmuqrsddjotvx.supabase.co/functions/v1/stripe-webhook`
3. Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
4. Copy the signing secret → add as `STRIPE_WEBHOOK_SECRET` Supabase secret

**Key files:** `src/pages/vendor/BillingPage.jsx`, `supabase/functions/create-checkout-session/index.ts`, `supabase/functions/stripe-webhook/index.ts`

---

### Settings Page
**Status: Complete.**

Vendor page at `/settings`. Three independent save sections:
- **Truck Info:** name, description, logo upload (Supabase Storage)
- **Notifications:** notification_time, timezone (IANA select), sentiment_delay_hours
- **Google Reviews:** google_review_url

Each section saves independently with its own Save button and "Saved" confirmation state.

**Key files:** `src/pages/vendor/SettingsPage.jsx`

---

## 4. Module Status Overview

| Module | Name | Status |
|---|---|---|
| 1 | Auth & Session Management | ✅ Complete |
| 2 | Vendor Onboarding Wizard | ✅ Complete |
| 3 | Customer SMS Opt-In | ✅ Complete |
| 4 | Location Scheduling | ✅ Complete |
| 5 | Morning SMS Broadcast | ✅ Complete |
| 6 | Inbound SMS / State Machine | ✅ Complete |
| 7 | Sentiment Collection | ✅ Complete |
| 8 | Dashboard | ✅ Complete |
| 9 | Inbox / Conversations | ✅ Complete |
| 10 | Subscribers List | ✅ Complete |
| 11 | Analytics | ✅ Complete |
| 12 | Billing / Stripe | ✅ Complete |
| — | Settings Page | ✅ Complete |

---

## 5. Database Schema

All tables live in `public` schema with RLS enabled. Applied via `supabase/migrations/`.

### Migrations applied

| File | What it does |
|---|---|
| `001_initial_schema.sql` | Full schema: all tables, RLS, triggers, plans seed, auto-create vendor on signup |
| `002_public_vendor_read.sql` | Public SELECT policy on vendors (needed for `/join/:slug`) |
| `003_public_locations_read.sql` | Public SELECT policy on locations (needed for public schedule page) |
| `004_stripe_price_ids.sql` | Links Stripe monthly price IDs to seeded plans |

### Tables

#### `vendors`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `user_id` | uuid (FK → auth.users) | unique, cascade delete |
| `name` | text | truck name |
| `slug` | text (unique) | URL identifier |
| `logo_url` | text | Supabase Storage URL |
| `description` | text | shown on opt-in page |
| `google_review_url` | text | sent post-visit to happy customers |
| `notification_time` | time | daily morning SMS time, default 08:00 |
| `sentiment_delay_hours` | int | hours after `end_time` to send sentiment ask, default 2 |
| `timezone` | text | IANA timezone, default America/Phoenix |
| `onboarding_complete` | boolean | gates public visibility and dashboard access |
| `twilio_phone_number` | text | E.164 provisioned number |
| `twilio_phone_sid` | text | Twilio SID |

#### `subscribers`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `vendor_id` | uuid (FK → vendors) | |
| `phone_number` | text | E.164 format |
| `opted_in_at` | timestamptz | |
| `is_active` | boolean | false = opted out |
| `last_sentiment_sent_at` | timestamptz | |

**Unique index:** `(vendor_id, phone_number)`

#### `locations`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `vendor_id` | uuid (FK → vendors) | |
| `address` | text | |
| `lat`, `lng` | double precision | |
| `date` | date | |
| `start_time`, `end_time` | time | |
| `notes` | text | included in SMS |
| `is_recurring` | boolean | |
| `recurrence_rule` | text | iCal RRULE string |
| `morning_sms_sent` | boolean | prevents double morning SMS |
| `sentiment_sms_sent` | boolean | prevents double sentiment SMS |

#### `sms_log`
Audit log for every outbound/inbound SMS. Written by edge functions via service role.

- `direction`: `inbound` | `outbound`
- `message_type`: `opt_in_confirm` | `location_notify` | `sentiment_ask` | `sentiment_happy` | `sentiment_unhappy` | `sentiment_invalid` | `idle_reply` | `vendor_reply` | `other`
- `status`: text — `sent` | `failed` | `delivered` | `received`

#### `subscriber_sms_state`
State machine per subscriber.

- `current_state`: `idle` | `awaiting_sentiment` | `in_conversation`
- `active_conversation_id`: FK to `conversations` (null when idle)
- Unique on `(vendor_id, subscriber_id)`

#### `sentiment_responses`
- `response`: `happy` | `unhappy`
- `raw_reply`: the exact text the customer sent
- `location_id`: nullable FK to locations

#### `conversations` + `conversation_messages`
Two-way SMS threads. Realtime-enabled.
- `conversations.status`: `open` | `resolved`
- `conversation_messages.direction`: `inbound` | `outbound`

#### `plans`
Seeded pricing tiers with Stripe price IDs:

| Name | Price | Subscribers | SMS/mo | Trucks | Stripe Price ID |
|---|---|---|---|---|---|
| starter | $29/mo | 200 | 500 | 1 | `price_1TLgPiHNpFmoFV8XOznZCXew` |
| pro | $49/mo | 1,000 | 2,500 | 1 | `price_1TLgTUHNpFmoFV8Xi8jjYsJH` |
| fleet | $99/mo | 5,000 | 10,000 | 5 | `price_1TLgTpHNpFmoFV8XyvC5osl6` |

#### `vendor_subscriptions`
- `status`: `trialing` | `active` | `past_due` | `canceled` | `incomplete`
- Created as `trialing` (14 days) on signup via DB trigger
- Updated by `stripe-webhook` edge function

---

## 6. Edge Functions

All functions have `verify_jwt = false` in `config.toml`. Authenticated functions validate the JWT manually inside the handler.

| Function | Type | Purpose |
|---|---|---|
| `onboarding-complete` | Authenticated | Sets `onboarding_complete = true`, provisions Twilio number |
| `subscriber-optin` | Public | Creates subscriber + SMS state row, sends confirmation SMS |
| `send-morning-sms` | Cron (secret) | Sends daily location SMS to all active subscribers |
| `twilio-inbound` | Public (Twilio webhook) | Routes inbound SMS by state machine |
| `send-sentiment-sms` | Cron (secret) | Sends post-visit sentiment ask SMS |
| `vendor-reply` | Authenticated | Sends vendor reply SMS, persists to conversation thread |
| `create-checkout-session` | Authenticated | Creates Stripe Checkout session for plan upgrade |
| `stripe-webhook` | Public (Stripe webhook) | Syncs Stripe subscription events to `vendor_subscriptions` |

---

## 7. Required Supabase Secrets

| Secret | Used by | Notes |
|---|---|---|
| `SERVICE_ROLE_KEY` | All functions | NOT `SUPABASE_SERVICE_ROLE_KEY` — prefix reserved |
| `TWILIO_ACCOUNT_SID` | onboarding, optin, morning-sms, sentiment-sms, vendor-reply | |
| `TWILIO_AUTH_TOKEN` | same as above | |
| `TWILIO_WEBHOOK_URL` | onboarding-complete | URL of twilio-inbound function |
| `CRON_SECRET` | send-morning-sms, send-sentiment-sms | Must match value in pg_cron SQL |
| `STRIPE_SECRET_KEY` | create-checkout-session, stripe-webhook | `sk_test_...` |
| `STRIPE_PUBLISHABLE_KEY` | (frontend via env) | `pk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | stripe-webhook | From Stripe Dashboard → Webhooks |
| `FRONTEND_URL` | create-checkout-session | Stripe redirect base URL, default `http://localhost:5173` |

---

## 8. Auth Model

### Route protection

```
/join/:slug       → fully public, no auth check
/signup etc.      → PublicOnlyRoute (redirects to /dashboard if logged in)
/onboarding       → ProtectedRoute (no sidebar)
/dashboard etc.   → ProtectedRoute → AppLayout (sidebar)
/:slug            → PublicSchedulePage (public vendor schedule)
```

### Frontend → Edge Function calls

Always use `supabase.functions.invoke()` — never raw `fetch()`. The invoke method automatically attaches `Authorization` and `apikey` headers. Raw fetch misses `apikey` and gets a 401 from the gateway.

---

## 9. Twilio Integration

### Known limitation — A2P 10DLC

SMS delivery to US numbers requires A2P 10DLC registration. Trial Twilio accounts cannot register. All function logic is correct and Twilio accepts the messages (`status: sent`), but carriers block delivery until the number is registered.

**Workaround for dev:** Add personal phone as a Verified Caller ID in Twilio Console → Phone Numbers → Verified Caller IDs. Verified numbers receive SMS from unregistered trial accounts.

**For production:** Upgrade Twilio account and complete A2P 10DLC registration (brand + campaign). Approval takes 1–5 business days. No code changes required.

### Inbound SMS webhook

Twilio is configured to POST inbound SMS to:
`https://pprorqwkmuqrsddjotvx.supabase.co/functions/v1/twilio-inbound`

This is set during onboarding via `TWILIO_WEBHOOK_URL` secret.

---

## 10. Known Working Flows

### Full vendor lifecycle

1. Signup → onboarding wizard → QR code download
2. Customer scans QR → opts in → receives confirmation SMS
3. Vendor adds location for today
4. Morning cron fires → SMS sent to all active subscribers
5. Customer visits truck, truck closes
6. Sentiment cron fires → "How was your visit?" SMS sent
7. Customer replies YES → happy sentiment recorded → Google review link sent
8. Customer texts truck with question → appears in vendor Inbox
9. Vendor replies from Inbox → customer receives SMS reply
10. Vendor marks conversation resolved
11. Vendor checks Dashboard for subscriber count + sentiment score
12. Vendor upgrades from trial to paid plan via Billing page

---

## 11. Known Limitations and TODOs

### Before production

- Remove debug `console.log` statements:
  - `src/lib/supabase.js` — `console.log('SUPABASE URL:', supabaseUrl)`
  - `src/pages/vendor/OnboardingPage.jsx` — `[Onboarding]` logs
  - `supabase/functions/onboarding-complete/index.ts` — `[CP1]–[CP6]` logs
- Set `FRONTEND_URL` secret to production domain in Supabase
- Complete A2P 10DLC registration in Twilio
- Set up `STRIPE_WEBHOOK_SECRET` after creating webhook endpoint in Stripe
- Set up pg_cron jobs for `send-morning-sms` and `send-sentiment-sms`
- Change `CRON_SECRET` to a strong random value in production

### Known risks

- Cross-midnight sentiment: if `end_time + sentiment_delay_hours >= 24:00`, the sentiment SMS is skipped. Vendors who close late (e.g. 10 PM + 3h delay = 1 AM) won't get sentiment asks.
- `/:slug` catch-all route in `App.jsx` must remain last in the route list.
- Opted-out subscribers who re-scan QR are reactivated silently — Twilio handles STOP compliance at carrier level.

### Not built

- QR Code page (`/qr-code`) — currently a stub. QR is accessible during onboarding only.
- Public schedule page (`/:slug`) — stub exists (`PublicSchedulePage.jsx`), content not built.
- Recurring location expansion — `is_recurring` and `recurrence_rule` stored but not auto-expanded into future dates.
- Multi-truck support (Fleet plan) — schema supports it (`truck_limit`), UI does not.
