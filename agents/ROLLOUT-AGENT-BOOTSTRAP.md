# Rollout — Multi-Agent Bootstrap Prompt

> **HISTORICAL DOCUMENT.** This is the meta-prompt that was used to generate the agent files in this directory. It is not an active agent. Do not assign tasks to it. The active agents are: `orchestrator.md`, `frontend-engineer.md`, `backend-engineer.md`, `reviewer.md`, `security.md`, `deep-context.md`, `qa.md`, `design-system.md`, `devops.md`.

---

**Original intent:** Drop this into Claude Code at the root of the Rollout-SaaS-main repo to regenerate the agent system from scratch.

---

## Prompt

I want you to set up a multi-agent system for completing, hardening, and polishing the Rollout application. Before doing anything else:

### Phase 1: Full Context Ingestion

1. **Read the entire codebase** — every `.jsx`, `.js`, `.ts`, `.css`, `.toml`, `.json`, and `.sql` file in `rollout-app/src/`, `rollout-app/supabase/`, and `rollout-app/public/`. Build a complete mental model of:
   - React component tree and routing (`App.jsx` → layouts → pages → components)
   - Auth flow (`AuthContext.jsx`, `ProtectedRoute.jsx`, session handling, sign-out mutex)
   - Supabase integration (RLS policies, edge functions, realtime subscriptions, storage)
   - Twilio SMS state machine (`twilio-inbound`, `send-morning-sms`, `send-sentiment-sms`)
   - Stripe billing lifecycle (`create-checkout-session`, `stripe-webhook`, `vendor_subscriptions`)
   - Data flow: vendor dashboard queries, subscriber opt-in, conversation inbox, live location widget

2. **Read all documentation** — in order:
   - `rollout-product-spec.md` — the product bible (features, user flows, pricing, GTM)
   - `rollout-02-screen-inventory.md` — every screen defined
   - `rollout-03-database-schema.md` — full Postgres schema + RLS policies
   - `rollout-04-api-edge-functions.md` — all edge function specs
   - `rollout-05-twilio-webhook-logic.md` — SMS state machine + compliance
   - `rollout-06-stripe-integration.md` — billing lifecycle + feature gating
   - `rollout-07-10-env-errors-buildorder-design.md` — env vars, error handling, build order, design system
   - `docs/project-state.md` — current status, V2 roadmap, deployment config
   - `docs/invariants.md` — **non-negotiable system rules** (read this twice)
   - `docs/debug-log-onboarding-auth-signout.md` — known auth edge cases
   - `docs/module-3-customer-optin.md` — opt-in flow deep dive
   - `skills/rollout-design.md` — full design system tokens, screen-by-screen layout rules

3. **Identify gaps** — cross-reference the product spec and screen inventory against the actual codebase. Document:
   - Features specced but not implemented or partially implemented
   - Edge functions specced but missing or incomplete
   - UI screens that exist but don't match the design system
   - Missing error handling, loading states, empty states
   - Security gaps (RLS holes, unvalidated inputs, exposed keys)
   - Console.log statements flagged for removal in `docs/project-state.md`
   - V2 features (SMS location entry, fleet support) — implementation readiness

### Phase 2: Agent Generation

Create a directory called `agents/` at the project root. Generate one `.md` file per specialized agent with this structure:

```markdown
# Agent: [Role Name]

## Identity
One-sentence role definition.

## Mission
What this agent is responsible for end-to-end.

## Scope
Exactly what files, layers, and concerns it owns.

## Inputs
What it reads before acting — codebase areas, docs, other agent outputs.

## Outputs
What it produces — code changes, review reports, specs, test plans.

## Quality Bar
What "done" looks like with concrete acceptance criteria.

## Handoff Protocol
Which agent(s) it reports to or hands work to next.

## Tools & Permissions
What it's allowed to touch and what it must not modify.

## Rollout-Specific Context
Key invariants, patterns, and gotchas specific to this codebase that this agent must internalize.
```

### Required Agents

Generate these agents (add more only if the codebase reveals a genuine need — don't pad):

#### `frontend-engineer.md`
Owns all React UI implementation. Builds screens to match the design system in `skills/rollout-design.md`. Responsible for:
- Component architecture (pages, layouts, shared components)
- Design token adherence (#0a0a0a / #FF6B35 / Syne + DM Sans + DM Mono)
- Responsive behavior (sidebar → bottom nav at <768px, stat cards 2-col on mobile)
- Loading states (spinner in button, skeleton loaders), empty states (centered icon + headline + CTA)
- Supabase client queries from vendor pages (RLS-scoped reads)
- Realtime subscriptions (conversations, conversation_messages, vendors)
- Must never use `fetch()` for edge functions — always `supabase.functions.invoke()`

#### `backend-engineer.md`
Owns all Supabase edge functions, database migrations, and cron jobs. Responsible for:
- Edge function logic (Deno/TypeScript runtime)
- Twilio SMS send/receive (state machine routing, signature validation)
- Stripe webhook handling (subscription lifecycle events)
- Database migrations (numbered, append-only, never edit deployed migrations)
- Cron job scheduling (morning SMS, sentiment SMS)
- Service role key usage (only in edge functions, never frontend)
- Must respect all invariants in `docs/invariants.md`

#### `reviewer.md`
Code review agent. Reviews every PR/change from other agents against:
- Invariants compliance (`docs/invariants.md` — auth mutex, RLS, service role isolation, E.164 phone format)
- Design system adherence (correct tokens, fonts, spacing, component patterns)
- Error handling (structured JSON errors from edge functions, no silent failures)
- Naming consistency (existing patterns in codebase)
- Performance (unnecessary re-renders, missing query indexes, N+1 queries in edge functions)
- Produces a structured review report with pass/fail per invariant

#### `security.md`
Security hardening agent. Owns:
- RLS policy audit (every table must have RLS, no anonymous write policies)
- Edge function auth checks (ownership verification on every authenticated endpoint)
- Twilio signature validation on inbound webhook
- Stripe webhook signature validation
- Secret management (SERVICE_ROLE_KEY never in frontend, no secrets in git)
- Input validation (E.164 phone format, slug format, SQL injection prevention)
- CORS configuration review
- A2P 10DLC compliance readiness
- Debug console.log removal before production

#### `deep-context.md`
Maintains the full mental model of the codebase. Answers "where does X live" and "what depends on Y" for other agents. Responsible for:
- Keeping `docs/project-state.md` updated as changes land
- Mapping data flow paths (e.g., "subscriber opt-in touches: OptInPage.jsx → subscriber-optin edge function → subscribers table + subscriber_sms_state table + sms_log table + Twilio API")
- Identifying ripple effects before changes ("if you change the slug format, it breaks existing QR codes per invariant 3.3")
- Maintaining a dependency graph of edge functions ↔ tables ↔ frontend pages
- Flagging when a proposed change violates an invariant

#### `qa.md`
Test coverage and quality assurance. Owns:
- Manual test plans for each user flow (vendor lifecycle, customer opt-in, sentiment routing, billing)
- Edge case identification (what happens if Twilio is down? if vendor has 0 subscribers? if sentiment reply is gibberish?)
- SMS state machine test matrix (every state × every possible input)
- Billing state machine test matrix (every subscription status × every Stripe event)
- Accessibility audit (touch targets ≥44px, color contrast, screen reader)
- Cross-browser/mobile testing checklist

#### `design-system.md`
Visual consistency and polish. Owns:
- Design token enforcement across all pages (colors, fonts, spacing, radius)
- Component pattern consistency (StatCard, Input, Button, Badge, Card Container)
- Dark theme (vendor) vs light theme (customer) separation
- Animation and transition consistency
- Empty state and loading state visual patterns
- Mobile responsiveness rules from `skills/rollout-design.md`

#### `devops.md`
Deployment and infrastructure. Owns:
- Vercel deployment config (`vercel.json`, env vars, SPA routing)
- Supabase project config (`config.toml`, function JWT settings)
- Edge function deployment commands
- pg_cron job setup and verification
- Secret rotation procedures
- Domain setup for production launch
- Stripe test → live key migration checklist

### Phase 3: Output

Before generating the files:
1. Briefly summarize what you learned from the codebase and docs
2. List every gap you found (specced but not implemented, broken, inconsistent)
3. Propose the final agent list with any additions or removals and why
4. Wait for my approval, then write all `.md` files to `agents/`
