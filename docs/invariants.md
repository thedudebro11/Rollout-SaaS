# Rollout — System Invariants
**Last updated: 2026-04-07**

These are non-negotiable rules of the system. Every future module, edge function, migration, and UI change must respect these. If a requirement seems to violate an invariant, escalate rather than breaking the rule silently.

---

## 1. Auth & Security Invariants

### 1.1 The service role key never touches the frontend

`SERVICE_ROLE_KEY` is a Supabase secret injected into edge functions via `Deno.env.get('SERVICE_ROLE_KEY')`. It grants full database access, bypassing RLS entirely. It must never appear in:
- Any frontend source file
- Any `.env` file committed to version control
- Any API response body

The frontend only holds the anon key (`VITE_SUPABASE_ANON_KEY`), which is safe to expose and is scoped by RLS.

### 1.2 Sensitive operations go through edge functions

Operations that require the service role key — creating subscriber rows, updating vendor state, provisioning Twilio numbers — must go through Supabase Edge Functions. The frontend does not call the service role client directly.

### 1.3 Public endpoints must not rely on Supabase auth

Pages or API routes intended for unauthenticated users (customers visiting `/join/:slug`, the `subscriber-optin` function) must not assume a session exists. They must handle the unauthenticated case gracefully and must not return errors due to missing tokens.

### 1.4 Ownership must be verified in every authenticated edge function

When a vendor edge function receives a `vendor_id`, it must verify that the calling user owns that vendor before performing any write. Pattern:

```ts
const vendor = await supabase.from('vendors').select('id, user_id').eq('id', vendor_id).single()
if (vendor.user_id !== user.id) return json({ error: 'Forbidden' }, 403)
```

Skipping this check creates a horizontal privilege escalation vulnerability.

---

## 2. Edge Function Invariants

### 2.1 Public functions use `verify_jwt = false`

Functions that serve unauthenticated callers (e.g. `subscriber-optin`) must have `verify_jwt = false` in `supabase/config.toml`. Without this, the Supabase gateway rejects every request before the handler runs.

```toml
[functions.subscriber-optin]
verify_jwt = false
```

### 2.2 Authenticated functions validate the user inside the handler

Functions with `verify_jwt = false` that are intended for authenticated users must perform their own auth check using the `Authorization` header passed by the frontend:

```ts
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }
})
const { data: { user } } = await supabase.auth.getUser()
if (!user) return json({ error: 'Unauthorized' }, 401)
```

Never trust the request body to identify the user — always verify via the session token.

### 2.3 All frontend → edge function calls use `supabase.functions.invoke()`

Never call an edge function from the frontend using raw `fetch()`. Use:

```js
const { data, error } = await supabase.functions.invoke('function-name', {
  body: { ... },
})
```

`supabase.functions.invoke()` automatically attaches:
- `Authorization: Bearer <user-jwt>`
- `apikey: <anon-key>`

Raw `fetch()` will omit the `apikey` header and receive a `401 Unauthorized` from the Supabase gateway before the handler runs.

### 2.4 All edge functions return structured JSON error bodies

Every non-2xx response must include a JSON body with an `error` field:

```json
{ "error": "Human-readable message" }
```

The frontend extracts this via `fnError.context?.json()`. Silent or HTML error responses break the user-facing error display.

### 2.5 Twilio failures are non-fatal

If a Twilio API call fails (network error, bad credentials, no available numbers), the edge function must not return an error to the caller unless the Twilio operation is the primary purpose of the call. Subscriber creation and onboarding completion succeed regardless of Twilio state. Log the failure server-side; do not surface it to the user.

### 2.6 `SERVICE_ROLE_KEY` must not use the `SUPABASE_` prefix

Supabase reserves the `SUPABASE_` prefix for auto-injected runtime variables. Setting a secret named `SUPABASE_SERVICE_ROLE_KEY` will be silently rejected or cause conflicts. The secret must be named `SERVICE_ROLE_KEY`:

```ts
const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')
```

---

## 3. Database Invariants

### 3.1 `onboarding_complete = true` is required for public visibility

A vendor is only publicly visible (opt-in page, public schedule, Twilio interactions) when `onboarding_complete = true`. Every query that powers a public-facing feature must include this filter:

```sql
.eq('onboarding_complete', true)
```

Vendors in partial setup states must not be reachable by customers.

### 3.2 Subscribers are unique per (vendor, phone number)

The `subscribers` table has a `UNIQUE` index on `(vendor_id, phone_number)`. The application layer must check for existing subscribers before inserting and handle the duplicate case explicitly (reactivation or `already_subscribed: true` response). The database constraint is a backstop, not the primary guard.

### 3.3 Slug uniquely and publicly identifies a vendor

The `vendors.slug` column has a `UNIQUE` constraint. It is the only public identifier for a vendor — used in opt-in URLs (`/join/<slug>`), public schedule URLs (`/<slug>`), and Twilio inbound routing. Slugs must:
- Be set during onboarding Step 1
- Be URL-safe (lowercase, hyphens only — enforced by `generateSlug()`)
- Never be changed after the first QR code is distributed (changing the slug breaks existing QR codes)

### 3.4 `subscriber_sms_state` must be created alongside every new subscriber

Every new subscriber row must have a corresponding `subscriber_sms_state` row with `current_state = 'idle'`. The SMS state machine (Module 6) reads this table to route inbound messages. A subscriber without a state row will cause unhandled message routing.

### 3.5 All tables have RLS enabled

Every table in the schema has `enable row level security`. No table is left unprotected. Edge functions that need to bypass RLS must use the service role client explicitly — this is an intentional, documented exception, not a shortcut.

### 3.6 Edge functions write to RLS-protected tables via service role

The `subscribers`, `subscriber_sms_state`, `sms_log`, and `vendors` tables are written to by edge functions using the service role client. The schema comments document this explicitly. Do not add RLS write policies for these tables that would allow anonymous writes — the service role path is the correct one.

---

## 4. Frontend Invariants

### 4.1 Public pages never require authentication

Pages under the public customer theme (`/join/:slug`, `/:slug`) must function correctly with no Supabase session. They use the anon client for reads (relying on public RLS policies) and call public edge functions for writes. They must never show auth errors to customers.

### 4.2 No direct DB writes from public pages

Customer-facing public pages must not write to any database table directly using the Supabase client. All writes go through edge functions (which use the service role key and perform validation before writing).

### 4.3 The `onAuthStateChange` callback must be synchronous

The Supabase JS v2 auth system holds an internal mutex when firing `onAuthStateChange`. If the callback is `async` and awaits any Supabase operation (e.g. `getSession()`, `from().select()`), it will deadlock because those operations also try to acquire the same lock.

The callback must be synchronous. Any async work (e.g. fetching the vendor profile) must be kicked off as a fire-and-forget:

```js
// Correct
supabase.auth.onAuthStateChange((_event, session) => {
  setSession(session)
  if (session) fetchVendor(session.user.id) // fire-and-forget
  else setVendor(null)
})

// Wrong — will deadlock on sign-out
supabase.auth.onAuthStateChange(async (_event, session) => {
  setSession(session)
  if (session) await fetchVendor(session.user.id) // deadlock
})
```

### 4.4 Sign out must await before redirecting

```js
await supabase.auth.signOut({ scope: 'local' })
window.location.replace('/login')
```

Without `await`, `window.location.replace` runs before localStorage is cleared. The new page's `getSession()` finds the stale token and restores the session, bouncing the user back to the dashboard.

`scope: 'local'` is used intentionally — it clears the local session without a server round-trip, which prevents the auth mutex from locking during the sign-out sequence.

### 4.5 The `/:slug` catch-all route must be the last route defined

`App.jsx` contains a `<Route path="/:slug">` for the public vendor schedule. This pattern matches any single-segment path including `/login`, `/dashboard`, etc. It must be defined last in the `<Routes>` block so that specific routes take priority.

### 4.6 `ProtectedRoute` routing logic must not change without review

The routing gate is:
- No session → `/login`
- Session + `onboarding_complete = false` → `/onboarding`
- Session + `onboarding_complete = true` → render children

Changes to this logic affect every authenticated flow. Do not add additional conditions without considering all edge cases (e.g. what happens to a vendor mid-onboarding if the gate changes).

---

## 5. UX / Product Invariants

### 5.1 The opt-in flow must be frictionless

A customer should be able to subscribe in under 30 seconds with no account, no app download, and no prior knowledge of the product. Any change to `/join/:slug` that adds steps, required fields, or authentication is a product regression.

### 5.2 Phone input always normalises to E.164 before network calls

The display format (`(XXX) XXX-XXXX`) is for the user only. Everything sent over the wire — to edge functions, stored in the database, passed to Twilio — must be E.164 (`+1XXXXXXXXXX`). No phone number in the database should ever be in display format.

### 5.3 Success states must clearly differentiate new vs. existing subscribers

The opt-in page has two distinct success states. They must remain visually and textually distinct. Showing the same message to both is a UX regression — a returning subscriber seeing "You're in!" would think they double-subscribed.

### 5.4 Vendor public page requires `onboarding_complete = true`

A vendor without completed onboarding must not have a live opt-in page. The frontend query and the edge function both enforce this. A partially set-up vendor (e.g. has a slug but no Twilio number) must not appear as active.

### 5.5 QR code URLs must use the stable `/join/:slug` path

QR codes are printed and distributed physically. Once distributed, the URL they encode cannot be changed. The opt-in URL format is `/join/<slug>` and must remain stable. Do not rename or restructure this route.

---

## 6. Logging & Error Handling Invariants

### 6.1 Edge functions must use structured checkpoint logging during development

While debugging or building new edge functions, use labelled checkpoints (`[CP1]`, `[CP2]`, etc.) to isolate failure points. Every checkpoint log must identify:
- What was being attempted
- Whether it succeeded or failed
- Any relevant IDs or values

### 6.2 Debug logs must be removed before production deployment

Console logs added for debugging are temporary. The following files currently contain debug logs that must be removed before production:
- `src/lib/supabase.js` — `console.log('SUPABASE URL:', supabaseUrl)`
- `src/pages/vendor/OnboardingPage.jsx` — `[Onboarding]` session/token/function logs
- `supabase/functions/onboarding-complete/index.ts` — `[CP1]` through `[CP6]` logs

### 6.3 Never rely on silent failures

Every error path must either:
- Return a structured error response to the caller, or
- Log to console with enough context to diagnose the failure

Silent failures (swallowed exceptions, ignored error returns) hide production bugs and make incidents impossible to diagnose.

### 6.4 `sms_log` receives an entry for every SMS attempt

Every outbound SMS send attempt — regardless of success or failure — must result in a row in `sms_log`. This is the audit trail for billing, debugging, and compliance. Log the Twilio `sid` on success and null on failure; log the status as `'sent'` or `'failed'`.

---

## 7. Deployment Invariants

### 7.1 Migrations are applied in numeric order and are not edited after deployment

`001_initial_schema.sql` and `002_public_vendor_read.sql` are the applied migrations. New schema changes go in new numbered migration files. Applied migrations are never edited in place — that would cause drift between environments.

### 7.2 Edge functions are deployed per-function

Deploy individual functions:
```bash
npx supabase functions deploy <function-name> --project-ref <ref>
```

Do not assume all functions are deployed when only one was updated.

### 7.3 Required secrets must be set before deploying a function

Before deploying any edge function, verify that all secrets it reads via `Deno.env.get()` are set in the Supabase project:

| Function | Required Secrets |
|---|---|
| `onboarding-complete` | `SERVICE_ROLE_KEY`, `TWILIO_ACCOUNT_SID`\*, `TWILIO_AUTH_TOKEN`\*, `TWILIO_WEBHOOK_URL`\* |
| `subscriber-optin` | `SERVICE_ROLE_KEY`, `TWILIO_ACCOUNT_SID`\*, `TWILIO_AUTH_TOKEN`\* |
| `send-morning-sms` | `SERVICE_ROLE_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `CRON_SECRET` |

\* Optional — function degrades gracefully without these, but SMS won't work.

`send-morning-sms` treats all four secrets as hard requirements (no graceful degradation) — SMS delivery is its sole purpose.

A missing `SERVICE_ROLE_KEY` causes a hard 500 error on every request. This is intentional — it's a misconfiguration, not a graceful degradation case.
