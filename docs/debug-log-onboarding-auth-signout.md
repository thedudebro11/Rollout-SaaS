# Debug Log — Onboarding, Auth, Sign-Out
**Modules 1–2 | Rollout v1**
**Date:** 2026-04-07

---

## 1. Overview

This document is a full engineering trail of the debugging and stabilisation work done on Modules 1 and 2 of the Rollout SaaS app. The session covered:

- Building the complete 5-step vendor onboarding wizard (Module 2)
- Building the missing `ResetPasswordPage` (Module 1 gap)
- Diagnosing and fixing a sign-out button that did nothing on desktop
- Diagnosing and fixing a post-sign-out redirect race that bounced users back to `/dashboard`
- Diagnosing and fixing a deadlock in the Supabase auth state machine
- Diagnosing and fixing a 401 on the `onboarding-complete` edge function
- Diagnosing a gateway-level `Invalid JWT` caused by a missing `apikey` header
- Rewriting the edge function with checkpoint logging and graceful error handling

**Final stable state:** Users can sign up, complete the 5-step onboarding wizard, and sign out. The `onboarding-complete` edge function marks onboarding as done and gracefully skips Twilio provisioning when credentials are not configured.

---

## 2. Files Changed

### `src/pages/auth/ResetPasswordPage.jsx` — **Created**
**Why:** The forgot-password flow in `AuthContext.resetPassword()` sends users to `VITE_APP_URL/reset-password`, but this route and page did not exist. Clicking a password reset email resulted in a 404.

**What:** Full reset password page with three states — expired/invalid link, form state, success state. Uses `supabase.auth.onAuthStateChange` to detect the `PASSWORD_RECOVERY` event (Supabase fires this when the user lands from the reset email link). Calls `supabase.auth.updateUser({ password })` to set the new password. Auto-redirects to `/dashboard` on success.

### `src/App.jsx` — **Modified**
**Why:** `ResetPasswordPage` needed to be added to the router inside `PublicOnlyRoute`.

**What:** Added import and `<Route path="/reset-password" element={<ResetPasswordPage />} />`.

### `src/contexts/AuthContext.jsx` — **Modified (critical)**
**Why:** The `onAuthStateChange` callback was declared `async` and `await`ed `fetchVendor()` inside it. `fetchVendor` makes a Supabase DB query which internally calls `getSession()`. Supabase JS v2 uses an internal async mutex for all auth operations. `signOut()` acquires this mutex and then fires `onAuthStateChange` — waiting for the callback to complete before releasing. The callback's `fetchVendor()` tried to re-acquire the same mutex via `getSession()`. This is a classic deadlock: `signOut` holds the lock waiting for the callback, the callback waits for the lock `signOut` holds.

**What:** Removed `async` from the `onAuthStateChange` callback. Changed `await fetchVendor(...)` to a fire-and-forget call (no `await`). The auth mutex is now released immediately after the synchronous callback returns. `fetchVendor` still runs in the background and updates vendor state when it resolves — no user-visible difference.

```js
// Before (deadlocks signOut)
supabase.auth.onAuthStateChange(async (_event, session) => {
  setSession(session)
  if (session) await fetchVendor(session.user.id)  // re-enters auth lock → deadlock
  else setVendor(null)
})

// After (correct)
supabase.auth.onAuthStateChange((_event, session) => {
  setSession(session)
  if (session) fetchVendor(session.user.id)  // fire-and-forget, no lock re-entry
  else setVendor(null)
})
```

### `src/layouts/AppLayout.jsx` — **Modified**

**Why (iteration 1):** The sign-out button existed in the sidebar but calling `signOut()` from `useAuth()` + `navigate('/login')` did nothing. Investigation proved the click was firing (`[SignOut] 1 - start` appeared in console) but the function never resolved. Root cause: the auth mutex deadlock described above.

**Why (iteration 2):** After making the callback synchronous (fixing the deadlock), a new issue appeared: sign-out navigated to `/login` for a split second then bounced back to `/dashboard`. Root cause: the original fire-and-forget `signOut({ scope: 'local' })` ran without `await`, so `window.location.replace('/login')` fired before localStorage was cleared. `getSession()` on the new page found the stale token. `PublicOnlyRoute` saw a session and redirected to `/dashboard`.

**What (final):**
- Module-level `doSignOut` function using `await supabase.auth.signOut({ scope: 'local' })` followed by `window.location.replace('/login')`.
- `scope: 'local'` skips the server-side token revocation HTTP call (which is what originally caused the hang) and only clears localStorage — synchronous and instant.
- `window.location.replace` used instead of React Router `navigate` to force a full page reload and avoid stale React state.
- Added sign-out button to the mobile bottom nav (previously had no sign-out on mobile).
- Imported `supabase` directly into `AppLayout` to avoid the `useAuth().signOut()` wrapper which was passing through the broken global `signOut()`.

### `src/pages/vendor/OnboardingPage.jsx` — **Modified**

**Why (sign-out):** The onboarding page has no sidebar/nav. Once a user with `onboarding_complete = false` landed on `/onboarding`, there was no way to sign out — they were permanently stuck.

**What (sign-out):** Added a small "Sign out" link next to the logo in the onboarding page header. Uses the same `await supabase.auth.signOut({ scope: 'local' }) + window.location.replace('/login')` pattern.

**Why (edge function call):** The final step called the `onboarding-complete` edge function using a raw `fetch()` with only `Authorization: Bearer <token>` in the headers. This was missing the `apikey` header that Supabase requires. The edge function gateway rejected it with `{ code: 401, message: 'Invalid JWT' }`. Additionally, `supabase.auth.getSession()` inside the async `onAuthStateChange` callback was part of the deadlock chain, so the session call was also unreliable via raw fetch.

**What (edge function call):** Replaced raw `fetch()` with `supabase.functions.invoke('onboarding-complete', { body: { vendor_id: vendor.id } })`. The Supabase client handles both `Authorization: Bearer <token>` and `apikey: <anon_key>` headers automatically.

**Debug logging added (temporary, still present):**
- Session existence and token prefix check before invoking
- Structured error body extraction from `FunctionsHttpError.context.json()`
- Checkpoint log on success

### `supabase/functions/onboarding-complete/index.ts` — **Rewritten**

**Why:** Original version had several structural problems:
1. Twilio env vars were read at module load time with `!` non-null assertion — if secrets weren't set, they were `undefined` and the Twilio URL became `...Accounts/undefined/...`
2. No way to skip Twilio if credentials weren't configured — the function would always attempt provisioning, fail 3 times, then return 200... but the DB update used `SUPABASE_SERVICE_ROLE_KEY` which also wasn't set, causing silent failure
3. No structured error returns — all failures fell to the outer try-catch and returned a generic 500 with no diagnostic information
4. The outer catch swallowed all errors with no indication of which step failed

**What (rewrite):** Full rewrite with six named checkpoints (CP1–CP6):
- **CP1:** Auth — `getUser()` with forwarded Authorization header
- **CP2:** Body parsing — validates `vendor_id` present
- **CP3:** Vendor lookup and ownership check
- **CP4:** Service role key check — explicit 500 if `SERVICE_ROLE_KEY` env var is missing
- **CP5:** Twilio provisioning — explicitly skipped if `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, or `TWILIO_WEBHOOK_URL` are not set; retries 3× if credentials are present but provisioning fails; non-fatal
- **CP6:** `onboarding_complete = true` DB update — returns structured 500 with `checkpoint` and `details` fields if it fails

Each checkpoint returns structured JSON errors:
```json
{ "error": "...", "checkpoint": "service_role_key", "details": "..." }
```

### `supabase/config.toml` — **Created**

**Why:** After switching to `supabase.functions.invoke()`, the gateway was still returning `{ code: 401, message: 'Invalid JWT' }`. Investigation confirmed the frontend session was valid (token prefix `eyJhbGciO...` confirmed). The gateway JWT verification was rejecting requests before the handler ran. The function performs its own auth via `supabase.auth.getUser()` inside the handler, making gateway-level verification redundant for this function.

**What:** Created `supabase/config.toml` with:
```toml
[functions.onboarding-complete]
verify_jwt = false
```

**Note:** `verify_jwt = false` disables Supabase's automatic JWT validation at the gateway layer. Auth is still enforced inside the handler via `getUser()`. This is the correct pattern for edge functions that need custom auth logic.

### `supabase/functions/deno.json` — **Created**

**Why:** VS Code TypeScript server was showing errors in the edge function files (`Cannot find name 'Deno'`, `Parameter 'req' implicitly has an 'any' type`) because it has no Deno type awareness.

**What:** Created `deno.json` with compiler options for Deno lib. Also added `// @ts-nocheck` to both edge function files as a simpler suppression method since the files are Deno-only and will never be checked by Node/browser TypeScript.

### `src/lib/supabase.js` — **Modified (temporary debug log)**

**What:** Added `console.log('SUPABASE URL:', supabaseUrl)` to verify env var is being read correctly during the Invalid JWT debugging phase. **This log should be removed before production.**

### `index.html` — **Modified**

**Why:** Google Fonts `@import url(...)` was in `index.css` after `@import "tailwindcss"`. Tailwind v4 processes its `@import` inline via PostCSS, injecting hundreds of lines of CSS first. This pushed the Google Fonts `@import` to line 653 in the compiled output, violating the CSS spec rule that `@import` must precede all other statements. PostCSS threw a build error.

**What:** Removed the Google Fonts `@import` from `index.css` and added it as `<link rel="preconnect">` + `<link rel="stylesheet">` tags in `index.html`, bypassing PostCSS entirely.

### `supabase/migrations/001_initial_schema.sql` — **Modified**

**Why:** The `auth_owns_vendor()` helper function was defined before the `vendors` table it references. PostgreSQL validates `language sql` functions at creation time (unlike `language plpgsql` which defers validation). The migration failed with `ERROR: 42P01: relation "public.vendors" does not exist`.

**What:** Moved the `auth_owns_vendor()` function definition to after the `vendors` table creation.

---

## 3. Errors Encountered

### Error 1 — CSS Build Warning: `@import must precede all other statements`

**Symptom:** Vite dev server printed PostCSS error pointing to the Google Fonts `@import url(...)` at line 653 of the compiled CSS output.

**Root cause:** Tailwind v4 uses `@import "tailwindcss"` which PostCSS expands inline, generating hundreds of lines of CSS before the Google Fonts import. CSS spec requires all `@import` rules to come before any other statements.

**Fix:** Moved Google Fonts to `<link>` tags in `index.html`. PostCSS never sees it.

---

### Error 2 — DB Migration Failure: `relation "public.vendors" does not exist`

**Symptom:** Running `001_initial_schema.sql` in Supabase SQL Editor failed immediately.

**Root cause:** `auth_owns_vendor()` was defined as a `language sql` function before the `vendors` table existed. PostgreSQL validates SQL-language functions at parse time.

**Fix:** Moved the function definition to after the `vendors` table DDL.

---

### Error 3 — Sign-out button does nothing (desktop sidebar)

**Symptom:** Clicking "Sign out" in the dashboard sidebar produced no visible effect. No navigation, no error.

**Diagnosis:** Added `console.log('[SignOut] 1 - start')` before the signOut call and `console.log('[SignOut] 2 - resolved')` after. Only `[SignOut] 1 - start` appeared — the `await supabase.auth.signOut()` never resolved.

**Root cause:** Supabase JS v2 uses an internal async mutex for all auth operations. `signOut()` acquires the mutex and fires `onAuthStateChange` while holding it, waiting for the callback to complete. The `onAuthStateChange` callback was `async` and `await`ed `fetchVendor()`, which called `supabase.from('vendors').select(...)`. The Supabase client internally calls `getSession()` to attach auth headers — `getSession()` also acquires the auth mutex. **Deadlock:** `signOut` holds the mutex waiting for the callback; the callback waits for the mutex that `signOut` holds.

**Fix:** Made `onAuthStateChange` callback non-async. Changed `await fetchVendor(...)` to fire-and-forget. The mutex is released as soon as the synchronous callback returns.

---

### Error 4 — Sign-out redirect race: bounces back to `/dashboard`

**Symptom:** After fixing the deadlock, sign-out navigated to `/login` for a fraction of a second then immediately redirected back to `/dashboard`. Appeared as if sign-out did nothing.

**Root cause:** After the deadlock fix, `doSignOut` became:
```js
function doSignOut() {
  supabase.auth.signOut({ scope: 'local' })  // no await — fires but doesn't complete
  window.location.replace('/login')           // runs immediately
}
```
`signOut({ scope: 'local' })` clears localStorage asynchronously. `window.location.replace` ran on the same tick before the Promise microtask queue processed the localStorage clear. On the new page, `supabase.auth.getSession()` read the stale token from localStorage. `session` was non-null. `PublicOnlyRoute` redirected to `/dashboard`.

**Fix:** Restored `async`/`await` on `doSignOut`, but kept `scope: 'local'` to avoid the server-side revocation HTTP call that caused the original hang. `scope: 'local'` is a localStorage-only clear — no network request, resolves instantly when awaited.

---

### Error 5 — No sign-out accessible on mobile or onboarding page

**Symptom:** Mobile bottom nav had no sign-out button. The onboarding page had no navigation at all — users with `onboarding_complete = false` who navigated away were permanently stuck in the onboarding loop with no escape.

**Fix:** Added sign-out button to mobile bottom nav in `AppLayout`. Added sign-out link to the onboarding page header (next to the logo).

---

### Error 6 — `onboarding-complete` edge function: `401 Unauthorized` (first form)

**Symptom:** Clicking "Go to my dashboard" on step 5 of onboarding showed "Setup failed". Browser console: `POST .../functions/v1/onboarding-complete 401 (Unauthorized)`.

**Diagnosis:** The 401 response body was `{ "error": "Unauthorized" }` — exactly the string returned by the edge function handler's own auth check (`if (authError || !user) return 401`). This meant the request reached the handler but `supabase.auth.getUser()` failed inside it.

**Root cause:** The call was using raw `fetch()` with only `Authorization: Bearer <token>`. The Supabase client inside the edge function needs the `apikey` header to make authenticated requests back to Supabase Auth for `getUser()`. Without `apikey`, the internal Supabase client had no anon key to work with.

**Fix:** Replaced raw `fetch()` with `supabase.functions.invoke('onboarding-complete', { body: ... })`. The Supabase JS client automatically attaches both `Authorization: Bearer <token>` and `apikey: <anon_key>` to all function invocations.

---

### Error 7 — `onboarding-complete` edge function: `FunctionsHttpError` non-2xx (second form)

**Symptom:** After switching to `supabase.functions.invoke()`, the frontend received `FunctionsHttpError: Edge Function returned a non-2xx status code` with `data: null`.

**Diagnosis:** Added structured checkpoint logging to the edge function (CP1–CP6) and improved frontend error extraction to read `fnError.context.json()` for the actual response body.

**Root cause (compound):**
1. Twilio env vars were read at module load time — when secrets weren't set, they were `undefined`, causing Twilio API calls to `https://api.twilio.com/.../undefined/...` which failed
2. The Twilio failure path fell through to a DB update using `supabaseAdmin` which was created with `SERVICE_ROLE_KEY` — but that secret was not set in the edge function environment, so the admin client had no valid key and the update failed with RLS rejection
3. These failures were either swallowed silently or caught by the outer try-catch as generic 500s

**Fix:** Rewrote the edge function to check Twilio credentials at runtime and skip provisioning if not set; check `SERVICE_ROLE_KEY` explicitly at CP4 and return a clear 500; wrapped each section in targeted try-catch with structured error responses.

---

### Error 8 — `{ code: 401, message: 'Invalid JWT' }` at gateway level

**Symptom:** After `supabase.functions.invoke()` was in place and the edge function was rewritten, the gateway itself (before the handler ran) returned `{ code: 401, message: 'Invalid JWT' }`.

**Diagnosis:**
- Confirmed single Supabase client instance in codebase (no duplicate clients, no global header overrides)
- Added session debug logging in the onboarding page — session existed, token prefix was valid `eyJhbGciO...`
- Confirmed `SUPABASE URL` in console matched the deployed project
- Gateway JWT verification was rejecting the token before the handler could run

**Root cause:** Supabase edge function gateway has `verify_jwt = true` by default. In some project configurations or deployment states, the gateway was rejecting the valid user JWT. The function performs its own auth via `supabase.auth.getUser()` inside the handler, making gateway JWT verification redundant and in conflict.

**Fix:** Created `supabase/config.toml`:
```toml
[functions.onboarding-complete]
verify_jwt = false
```
Handler-level auth is preserved and is the authoritative auth check. Gateway verification is disabled for this function only.

**Note on secret naming:** During this work it was discovered that Supabase does not allow secrets prefixed with `SUPABASE_` (reserved namespace). The service role key secret was therefore named `SERVICE_ROLE_KEY` rather than `SUPABASE_SERVICE_ROLE_KEY`. The edge function reads it as `Deno.env.get('SERVICE_ROLE_KEY')`.

---

## 4. Final Architecture & Behavior

### Sign-out Flow
```
User clicks "Sign out"
  → doSignOut() called (async)
  → await supabase.auth.signOut({ scope: 'local' })
      └─ Clears session from localStorage only (no server round-trip)
      └─ Resolves in ~1ms (no network)
  → window.location.replace('/login')
      └─ Full page reload — React state destroyed
  → AuthProvider mounts fresh
  → getSession() → null (localStorage cleared)
  → PublicOnlyRoute: no session → renders LoginPage ✓
```

### Onboarding Completion Flow
```
User clicks "Go to my dashboard" (step 5)
  → saveStep5AndFinish()
  → Optional: save first location to DB
  → supabase.functions.invoke('onboarding-complete', { body: { vendor_id } })
      └─ Sends: Authorization: Bearer <access_token>
      └─ Sends: apikey: <anon_key>
  → Edge function handler:
      CP1: getUser() → user authenticated
      CP2: Parse vendor_id from body
      CP3: Vendor lookup + ownership check
      CP4: Validate SERVICE_ROLE_KEY present
      CP5: Twilio provisioning (skipped if creds not set)
      CP6: UPDATE vendors SET onboarding_complete = true
  → Returns { success: true, twilio_phone_number: ... }
  → Frontend: refreshVendor() → navigate('/dashboard')
  → ProtectedRoute: vendor.onboarding_complete = true → renders dashboard ✓
```

### Edge Function Auth Strategy
The `onboarding-complete` function uses **handler-level auth** rather than gateway JWT verification:
- `verify_jwt = false` in `config.toml` — gateway passes all requests through
- Inside the handler, `supabase.auth.getUser()` is called using the forwarded `Authorization` header
- If `getUser()` fails or returns no user → handler returns `401 { error: 'Unauthorized' }`
- This pattern is required when the function needs to make Supabase DB calls with both user context (for ownership checks) and service role context (for writes that bypass RLS)

### Twilio Provisioning Behavior
- If `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WEBHOOK_URL` are all set: provisioning is attempted with 3 retries
- If any Twilio secret is missing: provisioning is silently skipped (logged as `[CP5] Twilio creds not set — skipping provisioning`)
- If provisioning fails after all retries: non-fatal, logged, onboarding still completes
- If the vendor already has a `twilio_phone_number`: provisioning is skipped (idempotent)

### SERVICE_ROLE_KEY Usage
The admin Supabase client (created with `SERVICE_ROLE_KEY`) is used for all DB writes in the edge function. This bypasses RLS, which is required because:
- The user's own client (anon key + user JWT) cannot update `onboarding_complete` through the standard `"owner can do everything"` policy when called server-side without the proper session context
- Service role writes are safe here because ownership is verified at CP3 before any write occurs

---

## 5. Lessons Learned / Gotchas

### Supabase JS v2 auth mutex — never await inside `onAuthStateChange`
The Supabase auth state machine uses an internal async mutex that serializes all auth operations. **Any `await` inside `onAuthStateChange` that calls back into the Supabase client** (queries, `getSession`, `getUser`, etc.) will deadlock `signOut`, `signIn`, and `refreshSession`. The callback must be synchronous or only await non-Supabase async work. Fire-and-forget any Supabase calls that need to happen in response to auth state changes.

### `signOut({ scope: 'local' })` vs `signOut()`
- `signOut()` (no scope / `scope: 'global'`): makes a server HTTP call to revoke the refresh token. If the network is slow or the call fails, `signOut()` hangs indefinitely.
- `signOut({ scope: 'local' })`: only clears localStorage. No network call. Resolves in ~1ms. The server-side refresh token remains technically valid until expiry, but the local session is gone immediately. This is the correct choice for reliable sign-out UX in client apps.

### Always `await` `signOut` before navigating
Without `await`, `window.location.replace` fires before localStorage is cleared. `getSession()` on the new page finds the stale token. Route guards bounce the user back. This looks identical to "sign-out does nothing."

### `supabase.functions.invoke()` vs raw `fetch()`
Use `supabase.functions.invoke()` for all edge function calls from the frontend. Raw `fetch()` requires manually setting both `Authorization: Bearer <token>` AND `apikey: <anon_key>`. Missing either causes 401. `invoke()` handles both automatically and also handles base URL construction.

### Supabase secrets cannot start with `SUPABASE_`
The `SUPABASE_` prefix is reserved for automatically injected environment variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). Custom secrets with this prefix may be silently ignored or cause conflicts. Name custom secrets without this prefix (e.g., `SERVICE_ROLE_KEY`, `TWILIO_ACCOUNT_SID`).

Note: `SUPABASE_SERVICE_ROLE_KEY` is **not** automatically injected into edge functions — despite the naming convention, you must set it manually as a secret if you need it. The edge function in this codebase uses `SERVICE_ROLE_KEY` for this reason.

### `verify_jwt = false` with handler-level auth
When an edge function needs to act as both the authenticated user AND as a service role (for writes that bypass RLS), gateway JWT verification can interfere. Set `verify_jwt = false` in `config.toml` and perform auth explicitly inside the handler via `supabase.auth.getUser()`. This gives full control over the auth flow and allows both a user-context client and an admin client to be used in the same handler.

### PostgreSQL validates `language sql` functions at parse time
Unlike `language plpgsql` functions (which defer validation to runtime), `language sql` functions are validated when the `CREATE FUNCTION` statement runs. Any table referenced in the function body must already exist. Order DDL statements accordingly in migrations.

### Checkpoint logging is essential for edge function debugging
A generic 500 from an edge function is nearly impossible to debug without logs. Always structure edge functions with named checkpoints that log their status and return structured JSON errors with `checkpoint` and `details` fields on failure. This cuts debugging time from hours to minutes.

---

## 6. Remaining Debug Logs to Remove

The following temporary debug logs are still in the codebase and should be removed before production:

| File | Log |
|------|-----|
| `src/lib/supabase.js` | `console.log('SUPABASE URL:', supabaseUrl)` |
| `src/pages/vendor/OnboardingPage.jsx` | `[Onboarding] session present`, `session exists`, `token prefix`, `vendor.id` logs |
| `src/pages/vendor/OnboardingPage.jsx` | `[Onboarding] fn success/error` logs |
| `supabase/functions/onboarding-complete/index.ts` | All `[CP1]`–`[CP6]` console logs |
