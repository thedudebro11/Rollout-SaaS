# Rollout — Environment Variables
### Document 07

---

## Required Environment Variables

### Supabase (frontend + backend)
```
VITE_SUPABASE_URL=https://[project-ref].supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ... (edge functions only, never expose to frontend)
```

### Twilio (edge functions only)
```
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WEBHOOK_URL=https://[project-ref].supabase.co/functions/v1/twilio-inbound
```

### Stripe (edge functions only)
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STARTER_MONTHLY_PRICE_ID=price_...
STRIPE_STARTER_ANNUAL_PRICE_ID=price_...
STRIPE_PRO_MONTHLY_PRICE_ID=price_...
STRIPE_PRO_ANNUAL_PRICE_ID=price_...
STRIPE_FLEET_MONTHLY_PRICE_ID=price_...
STRIPE_FLEET_ANNUAL_PRICE_ID=price_...
```

### Google Maps (frontend)
```
VITE_GOOGLE_MAPS_API_KEY=AIza...
```

### App Config
```
VITE_APP_URL=https://rollout.app
VITE_APP_ENV=production (development | staging | production)
```

---

## Local Development (.env.local)
Use Supabase local dev, Twilio test credentials, Stripe test mode keys.
```
VITE_APP_ENV=development
STRIPE_SECRET_KEY=sk_test_...
TWILIO_ACCOUNT_SID=AC... (test credentials)
```

---
---

# Rollout — Error States & Failure Handling
### Document 09

---

## SMS Failures

### Twilio send fails (network error / invalid number)
- Log failure to sms_log with status = 'failed'
- Do NOT retry automatically (risk of double-sending)
- Show warning on vendor dashboard: "Some messages may not have delivered"
- Do NOT crash the cron job — continue sending to other subscribers

### Subscriber hits SMS limit for plan
- Stop sending outbound SMS to that vendor
- Show dashboard banner: "You've reached your monthly SMS limit. Upgrade to keep sending."
- Do NOT silently drop — vendor must know
- Location notifications still show on calendar, just SMS is paused

### Vendor's Twilio number fails to provision
- Show error in onboarding: "We couldn't assign your phone number. Please try again or contact support."
- Retry provisioning up to 3 times
- If all fail → alert Rollout admin via email

---

## Subscription Failures

### Trial expired, no payment method
- Restrict SMS sending (morning notifications + sentiment)
- Dashboard still accessible (read-only)
- Banner on every page: "Your trial has ended. Add a card to keep Rollout running."
- Redirect to billing page on any restricted action

### Payment failed (past_due)
- 3-day grace period — full access continues
- Email vendor on day 1: "Payment failed — update your card"
- Email vendor on day 3: "Last chance — service pauses tomorrow"
- After grace period: SMS sending disabled, dashboard read-only
- Stripe auto-retries payment 3x over 7 days

### Vendor cancels mid-month
- Access continues until current_period_ends_at
- No refunds (standard SaaS)
- Show "Your subscription ends on [date]" banner

---

## Auth Failures

### Session expired
- Auto-refresh via Supabase Auth
- If refresh fails → redirect to /login with "Your session expired. Please log in again."

### Unauthorized access attempt
- Redirect to /login
- RLS on Supabase prevents any data leakage

---

## Location Errors

### Cannot delete location after morning SMS sent
- Show error: "This location has already been announced to your subscribers and can't be deleted. You can edit the details or add a note."
- Allow editing notes field only (e.g. vendor can add "CANCELLED - sorry!")
- Cancellation blast SMS is a v2 feature

### Google Maps autocomplete fails
- Fall back to plain text address input
- Still save location, lat/lng will be null
- Public schedule page shows text address without map pin

---

## Onboarding Errors

### Logo upload fails
- Show error, allow retry
- Onboarding can continue without logo
- Default fallback: truck emoji + truck name initials avatar

### QR code generation fails
- Retry once automatically
- If fails again: show "QR code will be available shortly" and generate async
- Vendor can always access /qr-code page to download

---

## Inbound SMS Routing Errors

### Subscriber state not found
- Default to 'idle' state
- Create idle state row
- Continue routing as idle

### Corrupted state (edge case)
- Log error
- Reset state to 'idle'
- Send: "Something went wrong on our end. Your subscription is still active!"

---
---

# Rollout — Build Order
### Document 08

---

## Module Build Sequence

Each module depends on the previous. Do not skip ahead.

---

### Module 1 — Project Setup & Auth
**What we build:**
- Vite + React + Tailwind project scaffold
- Supabase project setup
- Auth pages: Signup, Login, Forgot Password
- Protected route wrapper
- Supabase schema migration (all tables)
- RLS policies

**Done when:** Vendor can sign up, log in, log out, reset password. Routes are protected.

---

### Module 2 — Onboarding Wizard
**What we build:**
- 5-step onboarding wizard UI
- Vendor row creation on signup
- Logo upload to Supabase Storage
- Slug generation from truck name
- QR code generation (use `qrcode` npm package)
- QR code download (PNG + PDF)
- Twilio number provisioning edge function
- onboarding_complete flag

**Done when:** New vendor completes wizard, has Twilio number assigned, QR code downloadable.

---

### Module 3 — Customer Opt-In Page
**What we build:**
- Public route /join/[slug]
- Branded opt-in page UI
- subscriber-optin edge function
- New vs returning subscriber detection
- Confirmation SMS via Twilio
- subscriber_sms_state row creation

**Done when:** Customer scans QR, lands on page, enters number, gets confirmation text. Vendor sees subscriber in list.

---

### Module 4 — Location Scheduling
**What we build:**
- Locations page with week/month calendar view
- Add location sheet (with Google Maps autocomplete)
- Edit location sheet
- Delete location (with morning_sms_sent guard)
- Recurring location support
- Public vendor schedule page /[slug]

**Done when:** Vendor can add, edit, delete locations. Public schedule page shows upcoming stops.

---

### Module 5 — Morning SMS Notifications
**What we build:**
- morning-notifications cron edge function
- SMS template rendering
- morning_sms_sent flag update
- sms_log entries

**Done when:** Cron fires at correct time, subscribers get location text, log shows delivery.

---

### Module 6 — Sentiment SMS & Routing
**What we build:**
- sentiment-dispatcher cron edge function
- 24hr new subscriber check
- 7-day throttle check (last_sentiment_sent_at)
- idle state check
- sentiment_ask SMS send
- subscriber_sms_state update to awaiting_sentiment
- twilio-inbound webhook handler
- Happy path: sentiment_response insert + review nudge SMS
- Unhappy path: conversation create + conversation_message + empathy SMS
- State machine routing (awaiting_sentiment → idle or in_conversation)
- Idle state handling

**Done when:** Full sentiment loop works end to end. Happy customer gets review link. Unhappy customer starts conversation thread.

---

### Module 7 — Conversation Inbox
**What we build:**
- Inbox page UI (two-panel layout)
- Conversation list with open/resolved filter
- Real-time message thread (Supabase realtime)
- Vendor reply input + send
- send-vendor-reply edge function
- resolve-conversation edge function
- Unread badge on nav
- Push notification on new inbound message (browser notification)

**Done when:** Vendor can see unhappy customer messages, reply in real time, mark resolved.

---

### Module 8 — Dashboard
**What we build:**
- Dashboard page with all 4 stat cards
- dashboard-stats edge function
- This week's schedule strip
- Recent sentiment activity feed
- Open conversations preview
- Empty states for all sections

**Done when:** Dashboard shows live data, all cards accurate, empty states handled.

---

### Module 9 — Subscriber List & QR Code Page
**What we build:**
- Subscribers page with list + search
- Masked phone numbers
- QR code page (standalone, always accessible)
- Analytics page (basic charts — subscriber growth, sentiment over time)

**Done when:** Vendor can view their subscriber list and re-download QR at any time.

---

### Module 10 — Stripe Billing
**What we build:**
- Billing page with plan cards
- create-checkout-session edge function
- Stripe Customer Portal integration
- stripe-webhook edge function (all events)
- Feature gating (SMS block when trial/subscription expired)
- Plan limit enforcement (subscriber cap, SMS cap)
- Dashboard banners for trial ending, payment failed, limit reached
- Trial countdown banner

**Done when:** Vendor can upgrade, downgrade, update card, cancel. Features restrict correctly on expired billing.

---

### Module 11 — Settings Page
**What we build:**
- Settings page UI
- All editable fields (name, logo, description, review URL, notification time, sentiment delay)
- Change password flow
- Delete account (with confirmation + Stripe subscription cancel)

**Done when:** Vendor can fully manage their account and preferences.

---

### Module 12 — Polish & Launch Prep
**What we build:**
- Landing page (marketing)
- Error boundaries on all pages
- Loading states on all async operations
- Mobile responsiveness audit
- Email notifications (trial ending, payment failed) via Supabase + Resend
- Meta tags + OG image for rollout.app
- Favicon + PWA manifest (add to home screen on mobile)

**Done when:** App is production-ready, all edge cases handled, mobile tested.

---
---

# Rollout — Design System
### Document 10

---

## Color Palette
```css
:root {
  /* Backgrounds */
  --color-bg: #0a0a0a;
  --color-surface: #141414;
  --color-surface-raised: #1c1c1c;
  --color-border: #2a2a2a;
  --color-border-subtle: #1f1f1f;

  /* Brand */
  --color-accent: #FF6B35;
  --color-accent-hover: #ff7d4d;
  --color-accent-muted: rgba(255, 107, 53, 0.15);

  /* Text */
  --color-text-primary: #f5f5f5;
  --color-text-secondary: #888888;
  --color-text-tertiary: #555555;
  --color-text-inverse: #0a0a0a;

  /* Signal */
  --color-success: #22c55e;
  --color-success-muted: rgba(34, 197, 94, 0.12);
  --color-warning: #f59e0b;
  --color-warning-muted: rgba(245, 158, 11, 0.12);
  --color-error: #ef4444;
  --color-error-muted: rgba(239, 68, 68, 0.12);
  --color-info: #3b82f6;
  --color-info-muted: rgba(59, 130, 246, 0.12);
}
```

---

## Typography
```css
/* Import in index.html */
/* Display: Syne — strong, modern, confident */
/* Body: DM Sans — clean, readable, approachable */

@import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

:root {
  --font-display: 'Syne', sans-serif;
  --font-body: 'DM Sans', sans-serif;
  --font-mono: 'DM Mono', monospace;
}
```

### Type Scale
| Token | Size | Weight | Font | Use |
|---|---|---|---|---|
| display-xl | 48px | 800 | Syne | Hero headlines |
| display-lg | 36px | 700 | Syne | Page titles |
| display-md | 24px | 700 | Syne | Section headers |
| body-lg | 18px | 400 | DM Sans | Lead text |
| body-md | 15px | 400 | DM Sans | Default body |
| body-sm | 13px | 400 | DM Sans | Secondary text |
| label | 12px | 500 | DM Sans | Labels, badges |
| mono | 13px | 400 | DM Mono | Phone numbers, codes, stats |

---

## Spacing Scale
Uses Tailwind's default spacing (4px base unit).
Key values: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64px

---

## Component Tokens

### Cards
```css
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 20px;
}

.card-raised {
  background: var(--color-surface-raised);
}
```

### Buttons
```css
/* Primary */
.btn-primary {
  background: var(--color-accent);
  color: var(--color-text-inverse);
  border-radius: 8px;
  padding: 10px 20px;
  font: 500 15px var(--font-body);
}

/* Secondary */
.btn-secondary {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
}

/* Ghost */
.btn-ghost {
  background: transparent;
  color: var(--color-text-secondary);
}

/* Danger */
.btn-danger {
  background: var(--color-error-muted);
  color: var(--color-error);
  border: 1px solid var(--color-error);
}
```

### Input Fields
```css
.input {
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 10px 14px;
  color: var(--color-text-primary);
  font: 400 15px var(--font-body);
}

.input:focus {
  border-color: var(--color-accent);
  outline: none;
}
```

### Badges
```css
.badge-success { background: var(--color-success-muted); color: var(--color-success); }
.badge-warning { background: var(--color-warning-muted); color: var(--color-warning); }
.badge-error   { background: var(--color-error-muted);   color: var(--color-error); }
.badge-neutral { background: var(--color-border);        color: var(--color-text-secondary); }
```

---

## Tailwind Config Additions
```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0a',
        surface: '#141414',
        'surface-raised': '#1c1c1c',
        border: '#2a2a2a',
        accent: '#FF6B35',
        'text-primary': '#f5f5f5',
        'text-secondary': '#888888',
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '8px',
        lg: '12px',
        xl: '16px',
      }
    }
  }
}
```

---

## Mobile-First Rules
- All layouts start mobile, expand for desktop
- Touch targets minimum 44×44px
- Bottom navigation on mobile (≤768px), sidebar on desktop
- No hover-only interactions — all actions must work on touch
- Dashboard stat cards: 2-column grid on mobile, 4-column on desktop
- Inbox: full-screen conversation on mobile (no split panel)
- Modals become bottom sheets on mobile
