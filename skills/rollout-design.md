---
name: rollout-design
description: >
  Use this skill whenever building any screen, component, page, or UI element
  for the Rollout SaaS application. Rollout is a food truck SMS retention and
  location scheduling platform. This skill must be triggered for ALL Rollout
  build sessions — it contains the complete design system, component patterns,
  screen-by-screen layout rules, and visual reference extracted from approved
  mockups. Use this whenever the user says "build module", "build this screen",
  "let's build", or references any Rollout screen by name (dashboard, inbox,
  onboarding, billing, subscribers, QR code, locations, settings, opt-in page,
  schedule page). Do not build any Rollout UI without reading this skill first.
---

# Rollout Design Skill

This skill contains everything needed to build Rollout UI with perfect
consistency. Read this before writing a single line of code for any screen.

## What is Rollout

Rollout is a SaaS platform for food truck and street vendor operators.
It solves three problems in one loop:
1. **Schedule** — vendor logs their locations for the week
2. **Notify** — subscribers get SMS when the truck is rolling out
3. **Protect** — post-visit sentiment routing captures happy reviews
   and intercepts complaints before they go public

Two distinct user contexts:
- **Vendor** — authenticated dashboard user (dark industrial theme)
- **Customer** — public-facing pages scanned from QR code (light warm theme)

---

## Core Design Tokens

### Colors — Vendor (Dark Theme)
```css
--bg: #0a0a0a;              /* page background */
--surface: #141414;          /* cards, panels */
--surface-raised: #1c1c1c;  /* inputs, elevated cards */
--border: #2a2a2a;           /* all borders */
--border-subtle: #1f1f1f;   /* dividers */
--accent: #FF6B35;           /* primary orange — CTAs, active states */
--accent-hover: #ff7d4d;
--accent-muted: rgba(255,107,53,0.15); /* tinted backgrounds */
--text-primary: #f5f5f5;
--text-secondary: #888888;
--text-tertiary: #555555;
--success: #22c55e;
--success-muted: rgba(34,197,94,0.12);
--warning: #f59e0b;
--warning-muted: rgba(245,158,11,0.12);
--error: #ef4444;
--error-muted: rgba(239,68,68,0.12);
```

### Colors — Customer (Light Theme)
```css
--bg: #fafaf8;               /* warm off-white */
--surface: #ffffff;
--border: #e5e5e3;
--text-primary: #1a1a1a;
--text-secondary: #666666;
--text-muted: #999999;
--cta-bg: #1a1a1a;           /* dark pill button */
--cta-text: #ffffff;
--accent-orange: #FF6B35;    /* "Today" badge, highlights */
```

### Typography
```
Display font: Syne (weights 600, 700, 800) — headlines, page titles, plan names
Body font:    DM Sans (weights 300, 400, 500, 600) — all body text, labels
Mono font:    DM Mono (weights 400, 500) — phone numbers, URLs, stats, prices
```

Google Fonts import:
```html
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
```

Tailwind config:
```js
fontFamily: {
  display: ['Syne', 'sans-serif'],
  body: ['DM Sans', 'sans-serif'],
  mono: ['DM Mono', 'monospace'],
}
```

### Spacing & Radius
- Base unit: 4px (Tailwind default)
- Card radius: 12px (rounded-xl)
- Button radius: 8px (rounded-lg) — pill buttons use rounded-full
- Input radius: 8px
- Badge radius: 6px

---

## Rollout Logo Mark

Orange filled circle (#FF6B35) + "Rollout" in Syne bold.
Used in sidebar top and on auth/onboarding pages centered.

```jsx
<div className="flex items-center gap-2">
  <div className="w-8 h-8 rounded-full bg-accent" />
  <span className="font-display font-bold text-xl text-text-primary">Rollout</span>
</div>
```

---

## Navigation

### Sidebar (desktop ≥768px) — 240px wide
```
[Rollout logo + wordmark]
─────────────────────────
Dashboard      (home icon)
Locations      (map-pin icon)
Inbox          (message-square icon) [red dot badge when unread]
Subscribers    (users icon)
Analytics      (trending-up icon)
QR Code        (qr-code icon)
─────────────────────────
Settings       (gear icon) — pinned to bottom
```

Active nav item: orange left border (4px) + orange icon + orange text
  `border-l-4 border-accent bg-accent/10 text-accent`
Inactive: muted text, no border
  `text-text-secondary hover:text-text-primary hover:bg-surface-raised`

### Bottom Nav (mobile <768px) — 5 items max
Dashboard / Locations / Inbox (badge) / Subscribers / More
Fixed to bottom, 60px height, dark surface background, border-top

---

## Core Components

### Stat Card
```
┌──────────────────────────┐
│ Card Label               │
│                          │
│ 1,234          [badge]   │
│ +12 this week            │
└──────────────────────────┘
bg: --surface
border: 1px solid --border
radius: 12px
padding: 20px
Label: 13px DM Sans --text-secondary
Number: 32px DM Mono --text-primary font-medium
Badge: small green pill "+X this week"
```

Sentiment Score card: number color changes by value
- >80%: --success (#22c55e)
- 60-80%: --warning (#f59e0b)
- <60%: --error (#ef4444)

### Primary Button
```
bg: #FF6B35
text: #0a0a0a (dark, not white)
radius: 8px
padding: 10px 20px
font: DM Sans 500 15px
hover: #ff7d4d
loading: spinner inline left of text, button disabled
```

### Ghost Button
```
bg: transparent
border: 1px solid --border
text: --text-primary
hover: bg --surface-raised
```

### Input Field
```
bg: --surface-raised (#1c1c1c)
border: 1px solid --border (#2a2a2a)
radius: 8px
padding: 10px 14px
text: --text-primary, DM Sans 15px
placeholder: --text-tertiary
focus: border-color --accent, no outline ring
```

### Badge / Status Chip
```
Active:     bg --success-muted, text --success, "Active"
Opted Out:  bg --border, text --text-secondary, "Opted Out"
Upcoming:   bg rgba(59,130,246,0.12), text #3b82f6
In Progress: bg --accent-muted, text --accent (+ pulse animation)
Completed:  bg --border, text --text-secondary
Open:       orange dot (●)
Resolved:   gray dot (●)
```

### Card Container
```css
background: var(--surface);
border: 1px solid var(--border);
border-radius: 12px;
padding: 20px;
```

---

## Screen-by-Screen Visual Rules

Read `references/screens.md` for detailed per-screen layout rules
extracted from approved mockups.

---

## Auth Pages (Signup / Login)

- Full dark page, single centered card max-width 400px
- Rollout logo centered at top (40px circle + wordmark)
- Headline in Syne 700 32px — color: --accent (orange, not white)
- Subheadline in DM Sans 15px --text-secondary
- Error message in --accent (orange) between headline and inputs
- Inputs: full width, standard dark input style
- Password field: show/hide eye icon right side
- "Forgot password?" right-aligned below password, DM Sans 13px --text-secondary underline
- CTA button: full width, orange, rounded-lg, spinner on loading
- Footer link: "Already have an account? **Log in**" — muted + bold link
- Background is pure #0a0a0a — no card border needed, just the content floats

---

## Onboarding Wizard

- Full page dark, NO sidebar/nav — focused flow
- Rollout logo centered top
- Progress indicator: 5 dots connected by a line
  - Completed dots: filled orange circle
  - Current dot: larger filled orange circle
  - Future dots: gray outline circle
  - Connecting line: orange for completed segments, gray for future
- "Step X of 5" in DM Sans 12px --text-secondary below dots
- Step headline: Syne 700 24-28px --text-primary, centered
- Content centered, max-width 480px
- Back button: ghost/text, left side
- Next button: orange primary, right side (or full-width on last step)
- "Skip for now": DM Sans 13px --text-secondary underline, centered below content

Step-specific notes:
- Step 1: Truck name uses large underline-only input (not boxed). Logo upload: dashed border box with image icon. Description input is boxed with character counter "0 / 80" bottom-right.
- Step 2: URL input is standard dark boxed input. "How do I find this?" is a collapsible accordion row with chevron.
- Step 3: Time picker uses large segmented display — hour and minute in dark raised boxes, AM/PM toggle beside them. Timezone shown in small muted text below with "— change" link.
- Step 4: QR code centered in white-background square (needs white to scan). Orange decorative truck icon around QR or beside it. Download PNG + Download PDF as ghost buttons side by side.
- Step 5: Standard form fields for address/date/time. "I'll add locations later" as skip link. Final CTA is "Go to my dashboard →" full width orange.

---

## Dashboard

Two-column layout on desktop:
- Left ~60%: greeting, stat cards, quick actions, schedule strip, sentiment feed
- Right ~40%: second sentiment feed panel + open conversations preview

Greeting: "Good morning, [Truck Name] 👋" — Syne 700 28px
Date: "Today: [date]" — DM Sans 14px --text-secondary

Stat cards: 4 in a row (2x2 on mobile)

Quick actions row: "Add Location" orange primary + "Download QR" ghost, side by side

Schedule Strip: horizontal 7-day row
- Each day cell: day abbrev + date number + location name truncated + time
- Today: orange border all around, slightly raised
- Empty days: dashed border, + icon centered
- Has location: shows address + time, orange left accent bar

Sentiment Feed section header: "Recent Sentiment Feed" Syne 600 + "View all →" orange link right
Each row: emoji + masked phone DM Mono + [Location] + time ago

Open Conversations section: header + count badge (dark circle) + "Open Inbox →" orange link
Each row: masked phone + message preview quoted + time ago

---

## Location Calendar

Header: "Locations" Syne 700 + "+ Add Location" orange button top right
Toggle: "Week View" | "Month View" — pill toggle, active = orange filled

Week view: 7 columns, day header (Mon/Tue etc + date number)
Each location block:
- Dark surface card inside column
- "Address" label small muted + truncated address bold
- Time range DM Mono
- Status chip
- "Sentiment Sent ✓" in green if sent
- "Subscribers notified: 12" if applicable
- Orange left border accent

Add Location Sheet: dark modal/bottom-sheet
- Address: Google Maps autocomplete input with maps pin icon left
- Date input with calendar icon
- Start/End time side by side
- Notes textarea
- Recurring toggle (off by default)
- Save: orange full width
- Cancel: ghost text centered below

Location Detail Sheet: appears right side on desktop
- "Location Detail Sheet" header Syne 600
- Full address, date+time, notes
- Status chip with orange pulse if In Progress
- Morning SMS status with green checkmark if sent
- Sentiment SMS status
- Subscribers notified count
- Edit button (ghost) + Delete button (ghost, disabled = grayed with tooltip "Delete disabled")

---

## Conversation Inbox

Two panel layout desktop:
Left panel (320px): conversation list
- Tabs: All | Open | Resolved — active tab has orange underline + orange text
- Each row: phone DM Mono bold (unread) / normal (read) + time right
- Message preview below phone, truncated, muted
- Orange dot right side (unread indicator)
- Orange left border on active/unread rows
- Tap to select → loads thread in right panel

Right panel: active thread
- Header: phone DM Mono bold + "Opted in [date]" muted + "Resolve" button top right (ghost with orange border)
- "Customer" label above their bubbles (muted, small)
- Customer bubbles: left-aligned, dark surface bg (#1c1c1c), rounded-lg, white text
- "Vendor" label above vendor bubbles (orange, small, right-aligned)  
- Vendor bubbles: right-aligned, orange bg (#FF6B35), dark text, rounded-lg
- Timestamps below each bubble, muted small
- Bottom: "Mark as Resolved" ghost button above input area
- Input: dark raised input "Type a message..." + "Send" orange button right

---

## Subscriber List

Header: "Subscribers" Syne 700 + "(243 active)" DM Mono --text-secondary top right
Search bar: full width, dark input, search icon left, "Search by phone number..."

Table columns: Phone Number | Opted In | Last Sentiment | Sentiment Date | Status
- Phone: DM Mono, masked format (520) ***-**34
- Opted In: DM Sans --text-secondary date
- Last Sentiment: emoji + "happy" or "unhappy" text, or "— none yet" muted
- Sentiment Date: relative time "3 days ago" or "—" muted
- Status: badge (Active green / Opted Out gray)

Opted out rows: full row dimmed opacity-50
"Cannot message" tooltip on hover of opted out rows

---

## QR Code Page

Centered card, max-width 520px
- Large QR code in white square container (rounded-xl, shadow)
- Truck name below: Syne 600 18px
- "Scan to follow us" DM Sans --text-secondary
- Two ghost buttons side by side: "⬇ Download PNG" + "⬇ Download PDF"
- Divider
- "Your opt-in link" label + "Copied!" state top right
- URL in dark monospace code box with clipboard icon button right
- Helper text muted below URL
- "What customers see when they scan" section header
- Phone frame mockup (dark rounded rectangle) with opt-in page scaled inside

---

## Settings Page

3-column card grid on desktop, stacked on mobile:

Column 1: Truck Info card
- Truck name: input + "Save" ghost button inline
- Logo: orange circle preview + "Change logo" ghost button
- Description: input with "39 / 80" counter bottom right
- Public URL: monospace code box read-only + "Copy" button

Column 2 top: Notifications card
- Morning notification time: time input with up/down arrows + timezone muted
- Sentiment SMS delay: dropdown select
- Save button full width

Column 2 bottom: Account card  
- Email: muted read-only text
- Change Password: button that expands inline form
- (Google review link field also here or separate card)

Column 3 top: Account/Billing card
- Current plan badge
- Next billing date
- Manage Billing button (ghost)
- Upgrade Plan button (ghost) with "→ Link to /billing" annotation

Column 3 bottom: Danger Zone card
- Red/orange border
- "Danger Zone" header in --error color
- "Delete Account" outlined red button
- Expands to show confirmation modal with "type DELETE to confirm" input

---

## Billing Page

Header: "Choose your plan" Syne 700 + date top right
Trial banner: dark card, orange "You're on a free trial" + rest in white + days remaining
Billing toggle: "Annual" | "Monthly" pill — active = orange filled

3 plan cards equal width:
Starter: standard border
Pro: orange border + "Most Popular" orange badge top right corner
Fleet: standard border

Each card:
- Plan name: Syne 600 20px
- Price: DM Mono 48px bold
- "per month, billed monthly" DM Sans 14px --text-secondary
- Thin divider
- Feature list: ✓ checkmark + feature text, each on own line
- CTA button: orange full width at bottom
- Downgrade link: "Switch to Starter" muted text centered below button

---

## Customer Opt-In Page (Light Theme)

Background: #fafaf8 (warm off-white)
Full screen mobile-first, max-width 480px centered

Layout top to bottom:
- Vendor logo: large circle (100px) centered, gray-100 background ring around it
- Truck name: Syne 700 28px dark
- Description: DM Sans 16px --text-muted centered
- Thin gray divider full width
- "Get notified where we are": Syne 600 22px dark centered
- Phone input: large, full width, white bg, gray border, rounded-xl, type=tel
  placeholder "(520) 555-0000"
- "Text Me Locations 🌮" button: full width, #1a1a1a bg, white text, rounded-full, 52px height
- Fine print: DM Sans 12px --text-muted centered, 2 lines

Success state: green checkmark + "You're in! 🎉" + "Watch for a text from us"
Already subscribed: "You're already on our list! 🌮" + "We'll see you soon."
Error: red border on input + "Please enter a valid US phone number" below input

---

## Public Schedule Page (Light Theme)

Background: #fafaf8
Max-width 1200px, centered

Header:
- Vendor logo circle centered (80px)
- Truck name Syne 700 24px centered
- Description DM Sans 16px muted centered
- Thin divider
- "Follow us by text 🌮" dark pill button: top RIGHT corner, sticky on scroll

"Where we'll be" — Syne 600 20px section header centered

Locations layout: responsive grid (1 col mobile, 2-3 cols desktop)
Each location entry:
- Day + date: Syne 600 16px (e.g. "Tuesday, April 8")
- Orange left border if today
- "Today" orange badge inline with date if today
- Address: DM Sans 15px dark
- Time range: DM Mono 14px --text-secondary
- Notes: italic muted below time

Past locations: opacity-60, "Passed" gray badge
"Show past locations ▾" collapse toggle

Empty state: "No upcoming locations scheduled" + "Follow us to get notified..." + "Follow Us 🌮" dark button

Footer: "Powered by Rollout at rollout.app" — DM Sans 12px muted centered

---

## Mobile Rules (All Screens)

- Minimum touch target: 44×44px
- Sidebar becomes bottom nav at <768px
- Stat cards: 2-column grid on mobile
- Inbox: full screen conversation view (no split panel)
- Modals become bottom sheets that slide up
- Calendar: horizontal scroll on mobile
- Settings: single column stacked cards
- Billing: stacked plan cards

---

## Loading & Empty States

Every async action: spinner inside button, button disabled, no layout shift
Every data list: skeleton loader while fetching (pulsing gray bars)

Empty state pattern:
- Centered in the empty area
- Muted icon (40px, --text-tertiary)
- Short headline DM Sans 500 16px --text-primary
- One line description DM Sans 14px --text-secondary
- CTA button below (orange primary or ghost depending on context)

---

## Reference Files

For detailed module-by-module build instructions, read:
- `references/screens.md` — extended per-screen component details
- `references/build-order.md` — module sequence and dependencies

---

## Quick Reference: What Goes Where

| Need | Look at |
|---|---|
| Colors / tokens | Core Design Tokens section above |
| Typography rules | Typography section above |
| Nav structure | Navigation section above |
| A specific screen layout | Screen-by-Screen section above |
| Component (button, input, card) | Core Components section above |
| Mobile behavior | Mobile Rules section above |
| Empty/loading states | Loading & Empty States section |