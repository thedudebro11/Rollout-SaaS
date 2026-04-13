# Module 3 — Customer SMS Opt-In Flow
**Rollout v1 | Route: `/join/:slug`**
**Status: ✅ Complete and tested**

---

## Overview

Module 3 implements the public-facing customer opt-in page. When a food truck operator shares their QR code (generated in Module 2), customers scan it and land on this page to subscribe to the truck's SMS location updates.

**Problem it solves:** Food truck customers currently have no reliable way to know where their favourite trucks are each day. This page gives them a one-tap way to subscribe via SMS — no app download, no account, just a phone number. The truck owner gets a growing subscriber list they can broadcast location notifications to.

**Final working outcome:** A customer visits `/join/:slug`, sees the truck's branding, enters their US phone number, and receives a confirmation SMS. The subscriber row is created in the database with an idle SMS state. The vendor can see the new subscriber in their dashboard list. Duplicate subscriptions are handled gracefully. The entire flow works without any user authentication.

---

## Flow Breakdown

### 1. Customer visits `/join/:slug`

The route `/join/:slug` is registered in `App.jsx` as a fully public route — no `ProtectedRoute` wrapper, no auth check. The `slug` parameter is extracted via React Router's `useParams()`.

```jsx
<Route path="/join/:slug" element={<OptInPage />} />
```

### 2. Public vendor data is loaded via Supabase

On mount, `OptInPage` queries the `vendors` table using the Supabase anon client:

```js
const { data, error } = await supabase
  .from('vendors')
  .select('id, name, slug, logo_url, description')
  .eq('slug', slug)
  .eq('onboarding_complete', true)
  .single()
```

This works without user authentication because of the public RLS policy added in migration `002`. The query is filtered to `onboarding_complete = true` so partially-set-up trucks don't have a live opt-in page.

If the vendor is not found, a friendly "Truck not found" state is shown.

### 3. Phone number input and validation

The phone input formats the number in real time as the user types, using a US-format formatter:

```
5205551234      → (520) 555-1234
(520) 555-1234  → displays as-is
+15205551234    → accepted on submit
```

Formatting logic strips all non-digits and re-formats into `(XXX) XXX-XXXX` for display. On submit, the display value is converted to E.164 format (`+1XXXXXXXXXX`) before being sent to the edge function.

The submit button is disabled until at least 10 digits are entered.

### 4. Submit calls the edge function

```js
const { data, error: fnError } = await supabase.functions.invoke('subscriber-optin', {
  body: { vendor_slug: slug, phone_number: e164 },
})
```

`supabase.functions.invoke()` is used (not raw `fetch`) so that `apikey` and any session headers are attached automatically. Since this is a public page, the user will not have a session — the function handles this correctly.

### 5. Edge function: `subscriber-optin`

The edge function runs on Supabase's Deno runtime and performs the following:

**a) Parse and validate the request body**
- Checks `vendor_slug` and `phone_number` are present
- Validates `phone_number` matches the E.164 US format regex: `/^\+1[2-9]\d{9}$/`
- Returns `422` with a user-facing error message if invalid

**b) Look up vendor by slug**
- Uses the service role client (bypasses RLS)
- Queries `vendors` where `slug = vendor_slug AND onboarding_complete = true`
- Returns `404` if not found

**c) Check for existing subscriber**
- Queries `subscribers` for this `vendor_id` + `phone_number` combination
- If found and `is_active = true` → returns `{ success: true, already_subscribed: true }` immediately, no SMS sent
- If found and `is_active = false` (previously opted out and re-joining) → reactivates the row, returns `already_subscribed: true`

**d) Insert new subscriber**
- Inserts row into `subscribers` table
- On insert error → returns `500`

**e) Create idle SMS state row**
- Inserts into `subscriber_sms_state` with `current_state = 'idle'`
- This is required for the SMS state machine (Modules 5 and 6) to route inbound messages correctly

**f) Send confirmation SMS via Twilio (optional)**
- Only attempted if `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `vendor.twilio_phone_number` are all set
- SMS template: `"You're on {vendorName}'s list! We'll text you our locations so you never miss us. Reply STOP anytime."`
- Result is logged to `sms_log` table (both success and failure)
- Twilio failure is **non-fatal** — the subscriber is still created

**g) Return result**
```json
{ "success": true, "already_subscribed": false }
```

### 6. UI success states

**New subscriber:**
> 🌮 You're in!
> Watch for a text from us. We'll let you know every time {Truck Name} is rolling out.

**Already subscribed:**
> 👋 You're already on our list!
> We'll see you soon 🙌

Both states show the vendor's logo/avatar for brand continuity.

---

## Files Created / Modified

### `src/pages/customer/OptInPage.jsx` — Created

The full public opt-in page. Responsibilities:
- Loads vendor data on mount using public Supabase query
- Renders vendor logo (or initials fallback avatar) and branding
- Handles phone input formatting and E.164 conversion
- Calls `subscriber-optin` edge function on submit
- Renders loading, 404, form, and two success states
- Uses the customer light theme (cream background, dark text, dark CTA button) — separate from the vendor dark theme

### `supabase/functions/subscriber-optin/index.ts` — Created

Public Deno edge function. Responsibilities:
- Validates phone number format
- Looks up vendor by slug using service role client
- Checks for existing subscribers (handles duplicates and re-subscriptions)
- Inserts new subscriber + idle SMS state row
- Sends Twilio confirmation SMS if credentials are configured
- Logs all SMS sends to `sms_log`
- Returns structured JSON responses with clear error messages

### `supabase/migrations/002_public_vendor_read.sql` — Created

Adds a public SELECT policy to the `vendors` table. Required for the opt-in page to load vendor branding without user authentication.

### `supabase/config.toml` — Modified

Added `verify_jwt = false` for the `subscriber-optin` function, since it is a public endpoint with no user session.

---

## Database / RLS Changes

### Why public read access to `vendors` was needed

The `vendors` table was created in migration `001` with a single RLS policy:

```sql
create policy "Vendor: owner can do everything"
  on public.vendors for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

This means only authenticated vendor owners can read or write their own rows. An unauthenticated customer visiting `/join/:slug` would receive no data — the vendor lookup would return null and the page would show "Truck not found" even for valid slugs.

### The fix — migration `002`

```sql
create policy "Vendors: public can read by slug"
  on public.vendors
  for select
  using (slug is not null);
```

This allows any user (authenticated or not) to SELECT from `vendors`, but only rows where `slug` is not null. Vendors without a completed step 1 (no slug assigned) are excluded automatically. Combined with the `onboarding_complete = true` filter in the frontend query, only fully set-up trucks have a live opt-in page.

**Run this in Supabase SQL Editor before testing Module 3.**

---

## Edge Function Design

### Why `verify_jwt = false`

The `subscriber-optin` function is a fully public endpoint — customers have no Supabase account and send no JWT. Supabase's default gateway JWT verification would reject every request before the handler runs. Setting `verify_jwt = false` in `config.toml` passes all requests through to the handler, which performs its own validation (phone format, vendor existence, etc.).

```toml
[functions.subscriber-optin]
verify_jwt = false
```

### Why the service role key is required

The function inserts into `subscribers` and `subscriber_sms_state` on behalf of an unauthenticated caller. Both tables have RLS enabled. Without the service role key, all insert attempts would be rejected by RLS. The service role client bypasses RLS entirely and writes directly. This is safe here because:

1. The vendor is verified to exist and have a valid slug
2. Only the `subscribers` and `subscriber_sms_state` tables are written to
3. No vendor-private data is modified or exposed

### How it safely handles public requests

- Validates input format before any DB operations
- Looks up vendor with `onboarding_complete = true` guard — prevents interactions with test/incomplete accounts
- All writes are scoped to the specific `vendor_id` returned by the slug lookup
- No sensitive vendor data (Twilio SIDs, service keys) is returned in the response

### How it avoids duplicate subscribers

```ts
const { data: existing } = await supabase
  .from('subscribers')
  .select('id, is_active')
  .eq('vendor_id', vendor.id)
  .eq('phone_number', phone_number)
  .single()

if (existing) {
  if (!existing.is_active) {
    // Reactivate opted-out subscriber
    await supabase.from('subscribers').update({ is_active: true }).eq('id', existing.id)
  }
  return json({ success: true, already_subscribed: true })
}
```

The `subscribers` table has a unique index on `(vendor_id, phone_number)`, so even if the check above had a race condition, the database would reject the duplicate insert at the constraint level.

### How Twilio is optional

The SMS send block is wrapped in a credential check:

```ts
if (accountSid && authToken && vendor.twilio_phone_number) {
  // send SMS
} else {
  console.log('Twilio not configured — skipping confirmation SMS')
}
```

If any of those three values are absent, the SMS is skipped silently. The subscriber is still created and the response is `{ success: true, already_subscribed: false }`. When Twilio is configured later, new subscribers from that point forward will receive the confirmation SMS.

---

## Validation Logic

### Phone formatting (display)

```js
function formatPhoneDisplay(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}
```

Strips non-digits, limits to 10 digits, formats as `(XXX) XXX-XXXX` progressively as the user types.

### E.164 conversion (submit)

```js
function toE164(raw) {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`
  return null
}
```

Handles both 10-digit and 11-digit (with leading 1) US numbers.

### Server-side validation

```ts
function isValidE164(phone: string): boolean {
  return /^\+1[2-9]\d{9}$/.test(phone)
}
```

Validates E.164 US format: `+1` followed by an area code starting with 2–9 (no 0 or 1 area codes), followed by exactly 9 more digits. Returns `422` with `"Please enter a valid US phone number"` if invalid.

---

## Error Handling

### Frontend

```js
if (fnError) {
  let body = null
  try { body = await fnError.context?.json() } catch (_) {}
  setError(body?.error || 'Something went wrong, please try again')
  return
}
```

Extracts the actual JSON error body from `FunctionsHttpError` to show the user a specific message (e.g., "Please enter a valid US phone number") rather than a generic error.

### Edge function

All error responses follow the same structure:
```json
{ "error": "Human-readable message" }
```

| Scenario | Status | Error |
|---|---|---|
| Missing `vendor_slug` or `phone_number` | 400 | `"Invalid request body"` |
| Invalid phone format | 422 | `"Please enter a valid US phone number"` |
| Vendor not found or not set up | 404 | `"Vendor not found"` |
| Subscriber insert failed | 500 | `"Something went wrong, please try again"` |
| Missing `SERVICE_ROLE_KEY` | 500 | `"Server misconfiguration"` |

Twilio failures are non-fatal and logged only server-side. The customer always sees a success state as long as their subscriber row was created.

---

## Testing Instructions

### Prerequisites

1. Run migration `002` in Supabase SQL Editor
2. Deploy the edge function:
   ```bash
   npx supabase functions deploy subscriber-optin --project-ref YOUR_REF
   ```
3. Ensure `SERVICE_ROLE_KEY` is set as a Supabase secret
4. Complete at least one vendor onboarding (to have a valid slug)

### Finding your vendor slug

**Option A:** Log into the app → go to Settings → copy the public schedule URL slug.

**Option B:** Query Supabase directly:
```sql
select name, slug from vendors where onboarding_complete = true;
```

### Test URL

```
http://localhost:5173/join/<your-slug>
```

Example:
```
http://localhost:5173/join/taco-titan
```

Use **incognito/private mode** to simulate a customer with no session.

### What success looks like

1. Page loads with vendor logo, name, and description
2. Enter a 10-digit US phone number — it auto-formats as `(XXX) XXX-XXXX`
3. Click "Text Me Locations 🌮"
4. Success screen shows: **🌮 You're in!**
5. If Twilio is configured: phone receives confirmation SMS
6. Vendor's subscriber list in Supabase now contains the new row

### Failure states to test

| Scenario | Expected |
|---|---|
| Invalid URL slug | "Truck not found" |
| Incomplete vendor (onboarding not done) | "Truck not found" |
| Invalid phone (e.g., 5 digits) | Submit button disabled |
| Submit with invalid E.164 (edge case) | Error: "Please enter a valid US phone number" |
| Submit same number twice | "You're already on our list!" |

---

## Known Gotchas

- **Slug must match exactly** — slugs are auto-generated from the truck name during onboarding (lowercased, hyphenated). Use the actual slug from the database, not a guess.

- **`onboarding_complete` must be `true`** — the query filters for this. Vendors who haven't finished onboarding won't appear on their opt-in page.

- **Migration `002` must be applied** — without the public read policy, the vendor lookup returns null for all unauthenticated visitors. The page shows "Truck not found" for every slug.

- **Use incognito for public testing** — the regular browser tab may have an active vendor session. Testing in the same tab can mask session-related issues since the anon client and authenticated client share the same `supabase` instance.

- **Twilio is optional but SMS won't send without it** — subscribers are created regardless. Once Twilio credentials and a phone number are provisioned, new subscribers from that point receive the confirmation SMS. Existing subscribers who signed up without Twilio will not retroactively receive it.

- **`SERVICE_ROLE_KEY` must be set** — the edge function uses the service role client to insert into RLS-protected tables. Without it, all insert operations fail silently and the function returns 500.

- **`verify_jwt = false` is required** — customers have no Supabase session. Without disabling gateway JWT verification, every request is rejected before the handler runs.

- **Opted-out subscribers (`is_active = false`)** — if a subscriber previously replied STOP and then scans the QR again, they are reactivated with `is_active = true`. They do not receive a new confirmation SMS (by design — Twilio handles STOP compliance and re-subscription messaging separately).
