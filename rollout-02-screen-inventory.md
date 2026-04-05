# Rollout — Screen Inventory
### Document 02

---

## Vendor-Facing Screens (Authenticated)

---

### S01 — Landing Page (Public)
**Route:** `/`
**Purpose:** Marketing page. Converts food truck operators into signups.
**Components:**
- Hero: headline, subheadline, CTA button (Start Free Trial)
- How it works: 3-step visual (Schedule → Notify → Protect)
- Feature highlights: Location scheduling, SMS notifications, Sentiment routing
- Pricing section
- Footer
**Empty states:** N/A
**Notes:** No auth required. Redirects to dashboard if already logged in.

---

### S02 — Signup Page (Public)
**Route:** `/signup`
**Purpose:** Create vendor account
**Components:**
- Email input
- Password input
- Confirm password input
- Submit button
- Link to login
**Validation:**
- Email must be valid format
- Password min 8 characters
- Passwords must match
**On success:** Redirect to onboarding wizard S03
**Error states:**
- Email already in use → "An account with this email already exists"
- Weak password → "Password must be at least 8 characters"

---

### S03 — Login Page (Public)
**Route:** `/login`
**Purpose:** Authenticate returning vendor
**Components:**
- Email input
- Password input
- Submit button
- Forgot password link
- Link to signup
**On success:** Redirect to dashboard S06
**Error states:**
- Invalid credentials → "Incorrect email or password"
- Unverified email → "Please verify your email before logging in"

---

### S04 — Forgot Password (Public)
**Route:** `/forgot-password`
**Components:**
- Email input
- Submit button
**On success:** "Check your email for a reset link"
**Error states:**
- Email not found → "No account found with that email"

---

### S05 — Onboarding Wizard (Authenticated, first-time only)
**Route:** `/onboarding`
**Purpose:** Get vendor fully set up before hitting dashboard
**Steps:**

**Step 1 — Truck Info**
- Truck name input (required)
- Logo upload (optional, can skip)
- Short description (optional, 1 line — shown on public schedule page)

**Step 2 — Google Review Link**
- Input field for Google review URL
- Helper text: "Find this in your Google Business Profile → Get more reviews → Share review form"
- Can skip (can add later in settings)

**Step 3 — Notification Preference**
- What time should we text your customers each morning? (default 8:00 AM)
- Time picker input
- Timezone auto-detected, can override

**Step 4 — Your QR Code**
- QR code displayed large
- Download PNG button
- Download PDF button (print-ready with "Scan to follow us" text below)
- Helper text: "Put this on your truck window, counter, or menu"

**Step 5 — Schedule Your First Location**
- Inline mini version of add location form
- Address input (Google Maps autocomplete)
- Date picker
- Start time / End time
- Can skip ("I'll add locations later")

**On complete:** Redirect to dashboard S06
**Progress:** Step indicator at top (1 of 5)
**Notes:** Wizard only shown once. If vendor navigates away mid-wizard, progress is saved. Wizard state tracked in vendors table (onboarding_complete boolean).

---

### S06 — Dashboard (Authenticated)
**Route:** `/dashboard`
**Purpose:** Main hub. Overview of everything at a glance.
**Components:**

**Top stat cards (4):**
- Total Subscribers (with +X this week badge)
- Locations This Week
- Sentiment Score (% happy over last 30 days)
- Reviews Driven (estimated — count of happy replies that received review link)

**This Week's Schedule (mini calendar strip):**
- Horizontal scroll of days Mon–Sun
- Each day shows location name + time if scheduled, or empty
- Tap day → goes to that location detail or add location

**Recent Sentiment Activity:**
- Last 5 sentiment responses
- Each row: subscriber phone (masked), response (😊 or 😞), time, location
- "View all" link → goes to analytics S11

**Open Conversations (inbox preview):**
- Count badge if any open threads
- Last 3 open conversations preview
- "Open Inbox" button → S09

**Quick Actions:**
- Add Location button
- Send Blast button (v2, grayed out in v1 with "Coming soon" tooltip)
- Download QR Code button

**Empty states:**
- No subscribers yet → "Share your QR code to start building your list" + download QR button
- No locations this week → "No locations scheduled — add one to start notifying customers" + Add Location button
- No sentiment data yet → "Sentiment data will appear after your first location ends"

---

### S07 — Location Calendar (Authenticated)
**Route:** `/locations`
**Purpose:** Full view of all scheduled locations, add/edit/delete
**Components:**
- Week view calendar (default) with month toggle
- Each location shown as a block with address + time
- "Add Location" button (top right)
- Each location block: tap → opens location detail sheet

**Add Location Sheet (slide-up modal):**
- Address input with Google Maps autocomplete
- Date picker
- Start time picker
- End time picker
- Notes input (optional)
- Recurring toggle: One-time / Weekly / Custom days
- Save button / Cancel

**Edit Location Sheet:**
- Same as add, pre-filled
- Delete button (with confirmation)

**Location Detail Sheet:**
- Address, date, time, notes
- Status: Upcoming / In Progress / Completed
- SMS scheduled: Morning notification time shown
- Sentiment SMS: scheduled time shown
- Subscribers notified: count
- Edit / Delete buttons

**Empty state:**
- No locations → "No locations scheduled yet. Add your first stop." + Add Location button

---

### S08 — Subscriber List (Authenticated)
**Route:** `/subscribers`
**Purpose:** View and manage all subscribers
**Components:**
- Total count header
- Search bar (search by phone)
- Subscriber rows:
  - Masked phone number (e.g. (520) ***-**34)
  - Opted in date
  - Last sentiment response (😊 / 😞 / —)
  - Last sentiment sent date
  - Status badge: Active / Opted Out
- Export CSV button (v2)

**Empty state:**
- No subscribers → "No subscribers yet. Share your QR code to start building your list." + Download QR button

---

### S09 — Conversation Inbox (Authenticated)
**Route:** `/inbox`
**Purpose:** Manage unhappy customer conversations
**Components:**
- Left panel: conversation list
  - Each row: masked phone, preview of last message, time, status badge (Open / Resolved)
  - Unread indicator dot
  - Filter tabs: All / Open / Resolved
- Right panel: active conversation thread
  - Message bubbles (customer = left, vendor = right)
  - Text input + Send button
  - Mark as Resolved button
  - Customer info sidebar: phone, opted in date, sentiment history

**Empty state:**
- No conversations → "No conversations yet. Unhappy customer replies will appear here." with a small illustration

**Notification:** Red badge on inbox nav item when open threads exist

---

### S10 — QR Code Page (Authenticated)
**Route:** `/qr-code`
**Purpose:** Access, preview, and download QR code
**Components:**
- Large QR code preview
- Truck name below QR
- "Scan to follow us" subtext
- Download PNG button
- Download PDF button (print-ready, 4x4 inch with bleed)
- Preview of what customer sees when they scan (mockup of opt-in page)
- Copy opt-in link button

---

### S11 — Analytics (Authenticated)
**Route:** `/analytics`
**Purpose:** Sentiment trends and subscriber growth over time
**Components:**
- Date range picker (Last 7 days / 30 days / 90 days / All time)
- Sentiment over time chart (line chart — % happy per week)
- Subscriber growth chart (bar chart — new subscribers per week)
- Response rate stat (% of sentiment texts that got a reply)
- Review link clicks stat
- Top locations by sentiment score (table)

**Empty state:**
- Not enough data → "Analytics will populate after your first few location events"

---

### S12 — Settings (Authenticated)
**Route:** `/settings`
**Components:**

**Truck Info section:**
- Truck name (editable)
- Logo upload/replace
- Short description (editable)
- Public schedule URL (read-only, copyable: rollout.app/[slug])

**Notifications section:**
- Morning notification time (time picker)
- Sentiment SMS delay after location end (default 2hrs, can set 1–4hrs)

**Review Link section:**
- Google review URL (editable)

**Account section:**
- Email (read-only)
- Change password
- Delete account (danger zone, requires confirmation)

**Billing section:**
- Current plan badge
- Next billing date
- Upgrade / Downgrade button → goes to S13
- Cancel subscription link

---

### S13 — Billing / Upgrade (Authenticated)
**Route:** `/billing`
**Purpose:** Manage subscription plan
**Components:**
- Current plan highlighted
- Plan comparison cards (Starter / Pro / Fleet)
- Each card: price, subscriber limit, SMS limit, features list, Select Plan button
- Current plan shows "Current Plan" badge, no button
- Annual toggle (show monthly vs annual pricing)
- Payment method on file (last 4 digits, expiry)
- Update payment method button → Stripe portal
- Invoice history table: date, amount, status, download PDF link

---

## Customer-Facing Screens (Public, No Auth)

---

### C01 — Customer Opt-In Page (Public)
**Route:** `/join/[vendor-slug]`
**Purpose:** Customer lands here from QR scan, opts into SMS list
**Components:**
- Vendor logo (large, centered)
- Truck name
- Short description
- Phone number input (large, mobile-optimized)
- "Text Me Locations" button (full width)
- Fine print: "By subscribing you agree to receive SMS from [Truck Name]. Reply STOP to unsubscribe. Msg & data rates may apply."
**New subscriber flow:** Submit → success state → "You're in! Watch for a text from us 🌮"
**Returning subscriber flow:** Submit → "You're already on our list! We'll see you soon 🌮"
**Error states:**
- Invalid phone number → "Please enter a valid US phone number"
- Submission error → "Something went wrong, please try again"
**Design notes:** This page is customer-facing. Should be clean, friendly, fast. Mobile-first. Truck branding front and center.

---

### C02 — Public Vendor Schedule Page (Public)
**Route:** `/[vendor-slug]`
**Purpose:** Customers can see the truck's upcoming locations without SMS
**Components:**
- Vendor logo + name header
- "Follow us by text" CTA button → links to C01
- This week's schedule list:
  - Each entry: day, date, address, time, optional note
  - Past locations grayed out
  - Today's location highlighted
- "No upcoming locations" state if schedule is empty
**Design notes:** Shareable link. Vendors can post this on Instagram/Facebook bio instead of manually typing locations every day.

---

## Navigation Structure (Authenticated)

**Sidebar (desktop) / Bottom nav (mobile):**
- Dashboard
- Locations
- Inbox (with unread badge)
- Subscribers
- Analytics
- QR Code
- Settings

**Top bar:**
- Truck name + logo
- Notification bell (for new inbox messages)
- Account menu (Settings, Billing, Logout)
