# Rollout — Project State
**Last updated: 2026-04-13**
**Status: All modules + Live Location + QR Code complete. Deployed to Vercel. V1 feature-complete.**

---

## 1. Project Overview

### What it is

Rollout is a B2B SaaS platform for food truck operators. It solves the problem of food truck customers not knowing where their favourite trucks are on a given day. Operators use Rollout to publish their location schedule; customers subscribe via SMS and receive notifications automatically.

### Core value proposition

- **For the operator:** A growing subscriber list + automated morning SMS with that day's location → zero manual effort after setup.
- **For the customer:** One QR code scan, enter a phone number, done. No app download, no account.

### Live URLs

| Environment | URL |
|---|---|
| Production (Vercel) | https://rollout-saa-s.vercel.app |
| Supabase project | https://supabase.com/dashboard/project/pprorqwkmuqrsddjotvx |

### High-level system architecture

```
[Customer browser]       [Vendor browser]
     |                        |
     |  /join/:slug            |  /dashboard, /locations, etc.
     |                        |
     └──────────┬─────────────┘
                |
         [React + Vite SPA]
         (deployed on Vercel)
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
| Realtime | Supabase Realtime on: `vendors`, `conversations`, `conversation_messages` |
| Hosting | Vercel (auto-deploys from GitHub main branch) |
| QR / PDF | `qrcode` (canvas render) + `jsPDF` (print-ready A4 flyer) |
| Geocoding | OpenStreetMap Nominatim (free, no API key) |

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

**Critical — vendorLoading race:** `vendorLoading` must be set to `true` in the same synchronous block as `setSession()`, before `fetchVendor()` is called. If set inside the async function, React may render a frame with session set but vendorLoading=false, causing a blank-screen flash on direct URL navigation.

```javascript
// CORRECT — both set synchronously, React batches them
setVendorLoading(true)
setSession(session)
fetchVendor(session.user.id)  // async, sets vendorLoading=false when done

// WRONG — vendorLoading set inside async function, causes blank flash
setSession(session)
fetchVendor(...)  // inside: setVendorLoading(true) — too late
```

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

Edge function `send-sentiment-sms` triggered by cron (hourly). Finds locations where `morning_sms_sent = true`, `sentiment_sms_sent = false`, and `end_time + sentiment_delay_hours` has passed in vendor's timezone.

Only sends to subscribers in `idle` state — does not interrupt active conversations.

After sending, transitions subscriber state to `awaiting_sentiment`. Module 6 handles the reply.

**SMS message:** `How was your visit to [Name] today? Reply YES if you loved it or NO if it could be better 🌮`

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

**Stripe webhook setup (done):**
- Endpoint: `https://pprorqwkmuqrsddjotvx.supabase.co/functions/v1/stripe-webhook`
- Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
- `STRIPE_WEBHOOK_SECRET` set in Supabase secrets

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

### Live Location
**Status: Complete.**

Vendor sidebar widget + customer public page banner.

**How it works:**
1. Vendor clicks "Go Live" button in sidebar → browser geolocation prompt
2. `navigator.geolocation.watchPosition` tracks movement continuously
3. Reverse geocodes coords via OpenStreetMap Nominatim (free, no API key)
4. Pushes lat/lng/address to `vendors` table every 30 seconds
5. Pulsing green dot + elapsed timer shown in sidebar while live
6. Stop button, `beforeunload` handler, and unmount cleanup all call `stopLive()`
7. Customer's public schedule page receives update instantly via Supabase Realtime
8. "Live now" banner appears with address + Google Maps link
9. Staleness check: banner auto-hides if `live_updated_at` > 5 minutes old (handles tab crash)

**Migration:** `005_live_location.sql` — adds `is_live`, `live_lat`, `live_lng`, `live_address`, `live_updated_at` to vendors table. Already applied.

**Key files:** `src/components/LiveLocationWidget.jsx`, `src/pages/customer/PublicSchedulePage.jsx`

---

### QR Code Page
**Status: Complete.**

Vendor page at `/qr-code`.

- QR code rendered to `<canvas>` via `qrcode` library (already in deps)
- QR encodes: `window.location.origin + '/' + vendor.slug`
- Copy link button with 2s "Copied!" confirmation flash
- **Download PNG** — `canvas.toDataURL()` → programmatic anchor click
- **Download Flyer PDF** — jsPDF A4 with: vendor name + description header, QR code centered, "Scan for schedule" headline, SMS subscribe CTA box, public URL footer
- How-to-use guide with numbered steps

**Key files:** `src/pages/vendor/QRCodePage.jsx`

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
| — | Live Location | ✅ Complete |
| — | QR Code Page | ✅ Complete |

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
| `005_live_location.sql` | Adds live location columns to vendors + enables Realtime on vendors table |

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
| `is_live` | boolean | true while vendor is broadcasting live location |
| `live_lat` | double precision | current GPS latitude |
| `live_lng` | double precision | current GPS longitude |
| `live_address` | text | reverse-geocoded street address |
| `live_updated_at` | timestamptz | last ping time — used for staleness check |

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
| `STRIPE_WEBHOOK_SECRET` | stripe-webhook | ✅ Set — from Stripe Dashboard Webhooks |
| `FRONTEND_URL` | create-checkout-session | ✅ Set — `https://rollout-saa-s.vercel.app` |

---

## 8. Infrastructure

### Vercel deployment
- **URL:** https://rollout-saa-s.vercel.app
- **Root directory:** `rollout-app`
- **Auto-deploys:** on every push to `main`
- **Env vars set:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- **SPA routing:** `vercel.json` rewrites all paths to `index.html`

### Supabase Auth URL config
- **Site URL:** `https://rollout-saa-s.vercel.app`
- **Redirect URLs:** `https://rollout-saa-s.vercel.app/**`

### pg_cron jobs (set up in Supabase)
| Job | Schedule | Function |
|---|---|---|
| `morning-sms-daily` | `0 13 * * *` (8am Central) | `send-morning-sms` |
| `sentiment-sms-hourly` | `0 * * * *` (every hour) | `send-sentiment-sms` |

---

## 9. Auth Model

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

## 10. Twilio Integration

### Known limitation — A2P 10DLC

SMS delivery to US numbers requires A2P 10DLC registration. Trial Twilio accounts cannot register. All function logic is correct and Twilio accepts the messages (`status: sent`), but carriers block delivery until the number is registered.

**Workaround for dev:** Add personal phone as a Verified Caller ID in Twilio Console → Phone Numbers → Verified Caller IDs. Verified numbers receive SMS from unregistered trial accounts.

**For production:** Upgrade Twilio account and complete A2P 10DLC registration (brand + campaign). Approval takes 1–5 business days. No code changes required.

### Inbound SMS webhook

Twilio is configured to POST inbound SMS to:
`https://pprorqwkmuqrsddjotvx.supabase.co/functions/v1/twilio-inbound`

---

## 11. Known Working Flows

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
13. Vendor clicks "Go Live" → customers see real-time location on public schedule page
14. Customer scans QR code → public schedule page → subscribes

---

## 12. Remaining Before Real Launch

### Must do
- Upgrade Twilio to paid account + complete A2P 10DLC registration (required for SMS delivery to real US numbers)
- Remove debug `console.log` statements from edge functions and frontend
- Switch Stripe from test keys to live keys
- Set up a custom domain

### Nice to have
- Landing/marketing page explaining Rollout to new operators
- Recurring location expansion (`is_recurring` stored but not auto-expanded)
- Multi-truck support (Fleet plan — schema ready, UI not built)
- Email notifications as fallback to SMS
