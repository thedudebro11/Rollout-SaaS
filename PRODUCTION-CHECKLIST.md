# Rollout — Production Launch Checklist

Check off each item as you complete it. Work top to bottom — P0 before P1 before P2.

---

## 🔴 P0 — App won't work for real users without these

### 1. Fix the morning SMS cron schedule
**Where:** Supabase Dashboard → SQL Editor

The cron currently runs once daily at 13:00 UTC and only fires for Central timezone vendors. Replace it with a 5-minute interval so all timezones work.

```sql
SELECT cron.unschedule('morning-sms-daily');

SELECT cron.schedule(
  'morning-sms-every-5min',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://pprorqwkmuqrsddjotvx.supabase.co/functions/v1/send-morning-sms',
    headers := '{"Content-Type":"application/json","x-cron-secret":"YOUR_CRON_SECRET_HERE"}'::jsonb,
    body := '{}'::jsonb
  )$$
);
```

> Replace `YOUR_CRON_SECRET_HERE` with the actual `CRON_SECRET` value from Supabase → Edge Functions → Secrets.

- [ ] Done

---

### 2. Upgrade Twilio to a paid account
**Where:** twilio.com → Console → Billing

Trial accounts cannot deliver SMS to real US numbers. Upgrade takes ~5 minutes.

- [ ] Done

---

### 3. Complete A2P 10DLC registration
**Where:** Twilio Console → Messaging → A2P 10DLC

Required for SMS delivery to US numbers at scale. Approval takes **1–5 business days** — start this first, it's the longest lead time.

Steps:
1. Register your **Brand** (company name, EIN if applicable, website)
2. Register a **Campaign** (use case: Marketing, describe the food truck notification program)
3. Wait for approval — no code changes needed after this

- [ ] Brand registered
- [ ] Campaign registered
- [ ] Approval received

---

## 🟡 P1 — Required before taking real payments

### 4. Switch Stripe to live keys
**Three places to update:**

**Supabase Dashboard → Edge Functions → Secrets**
- Update `STRIPE_SECRET_KEY` → `sk_live_...`
- Update `STRIPE_WEBHOOK_SECRET` → (get from step below)

**Vercel Dashboard → Your Project → Environment Variables**
- Update `VITE_STRIPE_PUBLISHABLE_KEY` → `pk_live_...`

**Stripe Dashboard (switch to live mode) → Developers → Webhooks**
- Add endpoint: `https://pprorqwkmuqrsddjotvx.supabase.co/functions/v1/stripe-webhook`
- Copy the signing secret → paste into `STRIPE_WEBHOOK_SECRET` in Supabase secrets above

- [ ] `STRIPE_SECRET_KEY` updated in Supabase
- [ ] `VITE_STRIPE_PUBLISHABLE_KEY` updated in Vercel
- [ ] Stripe live webhook endpoint added
- [ ] `STRIPE_WEBHOOK_SECRET` updated in Supabase

---

### 5. Deploy all edge functions
**Where:** Terminal in the project root

One new function was created (`resolve-conversation`) and several were modified. Run all deploys:

```bash
npx supabase functions deploy resolve-conversation --project-ref pprorqwkmuqrsddjotvx
npx supabase functions deploy twilio-inbound --project-ref pprorqwkmuqrsddjotvx
npx supabase functions deploy send-sentiment-sms --project-ref pprorqwkmuqrsddjotvx
npx supabase functions deploy stripe-webhook --project-ref pprorqwkmuqrsddjotvx
npx supabase functions deploy create-checkout-session --project-ref pprorqwkmuqrsddjotvx
npx supabase functions deploy subscriber-optin --project-ref pprorqwkmuqrsddjotvx
npx supabase functions deploy onboarding-complete --project-ref pprorqwkmuqrsddjotvx
npx supabase functions deploy vendor-reply --project-ref pprorqwkmuqrsddjotvx
```

- [ ] All 8 functions deployed

---

## 🟢 P2 — Before launch

### 6. Set up your custom domain
**Where:** Vercel + Supabase

1. **Vercel Dashboard** → Your Project → Domains → Add Domain → follow DNS instructions
2. **Supabase Dashboard** → Authentication → URL Configuration:
   - Site URL → `https://yourdomain.com`
   - Redirect URLs → `https://yourdomain.com/**`
3. **Supabase → Edge Functions → Secrets** → update `FRONTEND_URL` → `https://yourdomain.com`

- [ ] Domain added in Vercel and DNS configured
- [ ] Supabase Auth Site URL updated
- [ ] Supabase Auth Redirect URLs updated
- [ ] `FRONTEND_URL` secret updated

---

### 7. Confirm Supabase Storage bucket
**Where:** Supabase Dashboard → Storage

- [ ] `vendor-logos` bucket exists
- [ ] Public read is enabled on the bucket
- [ ] Upload policy allows paths prefixed with `user.id` (e.g. `<user_id>/logo.png`)

---

### 8. Confirm Supabase Realtime publication
**Where:** Supabase Dashboard → Database → Replication

- [ ] `vendors` table is in the `supabase_realtime` publication
- [ ] `conversations` table is in the `supabase_realtime` publication
- [ ] `conversation_messages` table is in the `supabase_realtime` publication

---

### 9. Verify Google Fonts loading in production
**Where:** Your live site → DevTools → Network tab → filter by "font"

`Syne`, `DM Sans`, and `DM Mono` should all load from `fonts.gstatic.com`. If any fall back to system fonts, check `rollout-app/index.html` for the Google Fonts `<link>` tag.

- [ ] Syne loading ✓
- [ ] DM Sans loading ✓
- [ ] DM Mono loading ✓

---

## Summary

| # | Item | Priority | Where |
|---|---|---|---|
| 1 | Fix pg_cron to every 5 min | 🔴 P0 | Supabase SQL Editor |
| 2 | Upgrade Twilio account | 🔴 P0 | twilio.com |
| 3 | A2P 10DLC registration | 🔴 P0 | Twilio Console |
| 4 | Switch Stripe to live keys | 🟡 P1 | Stripe + Supabase + Vercel |
| 5 | Deploy all edge functions | 🟡 P1 | Terminal |
| 6 | Custom domain setup | 🟢 P2 | Vercel + Supabase |
| 7 | Confirm storage bucket | 🟢 P2 | Supabase Dashboard |
| 8 | Confirm Realtime publication | 🟢 P2 | Supabase Dashboard |
| 9 | Verify Google Fonts | 🟢 P2 | Live site DevTools |
