# Rollout — Product Specification
### SMS Retention + Location Booking for Food Trucks & Street Vendors
**Version 1.0 | April 2026**

---

## 1. Product Overview

**Rollout** is a SaaS platform for food truck and street vendor operators that combines location scheduling, automated customer SMS notifications, and post-visit sentiment routing into one simple tool.

**Tagline:** *Book your spot. Notify your people. Protect your reputation.*

**Core Problem:** Food truck operators have no unified tool to manage where they're going, tell their customers about it, and follow up after the visit to capture happy reviews and intercept unhappy ones before they go public.

**Core Solution:** A three-part loop — Schedule → Notify → Follow Up — that runs automatically once set up, requiring minimal daily effort from the vendor.

---

## 2. Target User

**Primary:** Solo food truck or street vendor operator in the US
- Running 1 truck, 1–2 staff
- Operating 4–7 days/week across multiple locations
- Technically basic — comfortable with a smartphone, not a power user
- Currently using Facebook/Instagram to manually announce locations
- Has no structured customer follow-up process

**Secondary:** Small food truck fleet operators (2–5 trucks)

**Not targeting (v1):** Restaurant chains, ghost kitchens, delivery-only operations

---

## 3. Core Features

### 3.1 Location Scheduling
- Vendor creates a weekly schedule of locations and times
- Each location entry includes: address, date, start time, end time, optional notes (e.g. "limited menu tonight")
- Locations are saved as recurring or one-off
- Simple calendar view of the week ahead
- Shareable public schedule page (e.g. rollout.app/tacoking) that customers can bookmark

### 3.2 Automated SMS Notifications
- When a location is scheduled, SMS fires automatically to all subscribers the morning of (default: 8am local time)
- Vendor can customize message template or use default
- Default message format:
  > *"🚨 [Truck Name] is rolling out today! We'll be at [Location] from [Time]. Come find us 🌮"*
- Vendor can also send manual blasts (specials, cancellations, etc.)
- Subscribers manage their own opt-out via STOP reply

### 3.3 QR Code Subscriber Capture
- Each vendor gets a unique QR code generated on signup
- QR links to a branded opt-in page: vendor logo, name, one-line description, phone number field
- **New customer:** Submits number → immediately added to vendor's subscriber list → instant confirmation text fires:
  > *"You're on [Truck Name]'s list! We'll text you our locations so you never miss us. Reply STOP anytime."*
- **Returning subscriber:** Submits number → system recognizes them → page displays "You're already on our list, we'll see you soon 🌮" — no duplicate entry created, no text fired
- QR code downloadable as PNG/PDF for printing on truck window, menu, signage

### 3.4 Post-Visit Sentiment Routing
- 2 hours after a scheduled location's end time, automated SMS fires to eligible active subscribers
- **A subscriber is eligible for a sentiment text only if ALL three conditions are true:**
  1. A location for their vendor just ended (end_time + 2hrs has passed)
  2. They have been subscribed for at least 24 hours (prevents brand new opt-ins from getting a sentiment text the same day they join)
  3. They have not received a sentiment text from this vendor in the last 7 days (prevents spamming loyal daily customers — max one sentiment text per subscriber per vendor per week regardless of how many locations the vendor logs)
- **Reply 1 (Happy):** Customer receives:
  > *"So glad you loved it! Would mean the world if you left us a quick Google review 🙏 [Google Review Link]"*
- **Reply 2 (Unhappy):** Customer receives:
  > *"Sorry to hear that — [Owner Name] wants to make it right. What happened?"*
  - Customer's response routes to vendor's dashboard as a private conversation thread
  - Vendor receives push notification / SMS alert
  - Vendor can reply through the dashboard; customer receives it as a normal text
- **No reply:** No follow-up sent. Subscriber becomes eligible again after 7 days
- All sentiment data logged to vendor dashboard (% happy, % unhappy, common issues)

### 3.5 Vendor Dashboard
- Overview cards: total subscribers, locations this week, sentiment score, reviews driven
- Subscriber list with opt-in date and engagement history
- Location calendar with upcoming schedule
- Conversation inbox for active unhappy customer threads
- Manual SMS blast composer
- QR code download
- Settings: truck name, logo, Google review link, notification timing preferences

---

## 4. User Flows

### 4.1 Vendor Onboarding
1. Vendor lands on rollout.app
2. Signs up with email + password
3. Onboarding wizard (5 steps):
   - Truck name + upload logo
   - Paste Google review link
   - Set notification time preference (default 8am)
   - Download QR code
   - Schedule first location
4. Lands on dashboard — ready to go

### 4.2 Weekly Scheduling Flow
1. Vendor opens dashboard → clicks "Add Location"
2. Enters address (Google Maps autocomplete), date, start/end time, optional note
3. Saves — appears on calendar
4. System queues morning SMS for that date
5. System queues post-visit sentiment SMS for 2hrs after end time
6. Vendor does nothing else

### 4.3 Customer Opt-In Flow (New Subscriber)
1. Customer scans QR code at truck window
2. Lands on branded opt-in page (mobile optimized)
3. Enters phone number, taps "Text Me Locations"
4. System checks if number exists for this vendor — it does not
5. Receives confirmation text immediately
6. Added to vendor's subscriber list with opted_in_at timestamp

### 4.3b Returning Subscriber QR Scan
1. Existing subscriber scans QR code at truck window
2. Lands on same branded opt-in page
3. Enters phone number, taps "Text Me Locations"
4. System recognizes number as existing subscriber for this vendor
5. Page shows "You're already on our list, we'll see you soon 🌮"
6. No duplicate entry, no text fired, nothing changes in the database

### 4.4 Post-Visit Happy Flow
1. Sentiment SMS fires 2hrs after location end time
2. Customer replies 1
3. Customer receives Google review nudge with direct link
4. Vendor dashboard logs positive sentiment

### 4.5 Post-Visit Unhappy Flow
1. Sentiment SMS fires 2hrs after location end time
2. Customer replies 2
3. Customer receives empathetic response, asked what happened
4. Customer replies with complaint
5. Vendor receives push notification + dashboard alert
6. Vendor opens conversation thread in dashboard inbox
7. Vendor types reply → customer receives as SMS
8. Conversation continues until resolved
9. Vendor can mark thread as resolved

---

## 5. Tech Architecture

### 5.1 Stack
| Layer | Technology |
|---|---|
| Frontend | React + Tailwind CSS |
| Backend / Database | Supabase (Postgres + Auth + Realtime) |
| SMS | Twilio Programmable Messaging |
| Hosting | Vercel |
| Maps / Autocomplete | Google Maps Places API |
| Payments | Stripe |

### 5.2 Supabase Schema (Core Tables)

**vendors**
- id, email, name, logo_url, google_review_url, notification_time, created_at

**subscribers**
- id, vendor_id, phone_number, opted_in_at, is_active, last_sentiment_sent_at

**locations**
- id, vendor_id, address, lat, lng, date, start_time, end_time, notes, created_at

**sms_log**
- id, vendor_id, subscriber_id, message_body, direction (inbound/outbound), created_at

**sentiment_responses**
- id, vendor_id, subscriber_id, location_id, response (happy/unhappy), created_at

**conversations**
- id, vendor_id, subscriber_id, status (open/resolved), created_at

**conversation_messages**
- id, conversation_id, body, direction, created_at

### 5.3 Twilio Integration
- One Twilio phone number provisioned per vendor (ensures replies route back correctly)
- Inbound webhook parses reply → checks last outbound message context to determine routing (sentiment reply vs conversation reply)
- Outbound SMS triggered by Supabase scheduled functions (cron jobs) for location notifications and sentiment follow-ups
- All messages logged to sms_log table

### 5.4 Scheduled Jobs (Supabase Edge Functions)
- **Morning notification job** — runs daily at 7:45am, queries locations table for today's locations, fires SMS to all active subscribers for each vendor
- **Sentiment job** — runs every 30 minutes, queries locations where end_time + 2hrs has passed and sentiment SMS hasn't been sent for that location yet, then filters eligible subscribers by: (1) opted_in_at is more than 24 hours ago, and (2) last_sentiment_sent_at is null or more than 7 days ago. Fires sentiment SMS only to subscribers passing all checks, then updates last_sentiment_sent_at to now

---

## 6. Design Direction

**Aesthetic:** Clean, mobile-first, operator-grade utility tool. Not a startup toy. Feels like something a serious small business owner trusts.

**Palette:**
- Background: `#0a0a0a` near-black
- Surface: `#141414`
- Accent: `#FF6B35` (truck orange — energetic, food-world, action-oriented)
- Text: `#f5f5f5` primary, `#888` secondary
- Success: `#22c55e`
- Warning: `#f59e0b`

**Typography:**
- Display: DM Sans or Syne (confident, modern)
- Body: Inter (readable at small sizes on mobile)

**Key UX Principles:**
- Dashboard must be usable on mobile — vendors are checking it from their phone between orders
- Onboarding must be completable in under 5 minutes
- No feature should require more than 3 taps to reach
- Every empty state should have a clear CTA (no dead ends)

---

## 7. Pricing & Monetization

### Plans

| Plan | Price | Subscribers | SMS/month | Locations/month |
|---|---|---|---|---|
| Starter | $29/mo | Up to 200 | 500 | Unlimited |
| Pro | $49/mo | Up to 1,000 | 2,500 | Unlimited |
| Fleet | $99/mo | Up to 5,000 | 10,000 | Up to 5 trucks |

- All plans include QR code, sentiment routing, dashboard, conversation inbox
- 14-day free trial, no credit card required
- Flat pricing — no per-SMS overage surprises on Starter/Pro (overage on Fleet at $0.01/SMS)
- Annual billing option: 2 months free

### Unit Economics (Starter plan)
- Twilio cost per SMS: ~$0.0079
- 500 SMS/month = ~$3.95 Twilio cost
- Supabase / Vercel hosting: ~$2-3/vendor at scale
- Gross margin at $29/mo: ~$23 (~79%)

---

## 8. MVP Scope (v1 Launch)

**In scope:**
- Vendor auth (signup, login, password reset)
- Onboarding wizard
- Location scheduling + calendar view
- Automated morning SMS notifications
- QR code generation + opt-in page
- Post-visit sentiment routing (happy/unhappy split)
- Google review link nudge for happy customers
- Conversation inbox for unhappy customers
- Basic dashboard (subscriber count, sentiment score, locations this week)
- Stripe billing integration
- Public vendor schedule page

**Out of scope (v2+):**
- Fleet / multi-truck management
- Manual SMS blast composer
- Customer segmentation
- Analytics deep-dive
- Native mobile app
- Venue-side location marketplace (the two-sided booking marketplace — this is a v2 feature that requires separate validation)

---

## 9. Go-To-Market

**Target cities for launch:** Tucson, Phoenix, Austin, Portland — high food truck density, active vendor communities

**Acquisition channels:**
- Direct outreach to food truck vendors at local events and markets
- Facebook groups for food truck operators (highly active, vendors talk shop openly)
- Instagram — show the product in action, real vendor results
- Partner with food truck parks and commissary kitchens to offer Rollout to their vendors

**Positioning:**
- Not "SMS marketing software" (too generic, sounds expensive/complicated)
- "The tool that keeps your regulars coming back and your reviews clean"

**Launch offer:** First 3 months at $19/mo for founding vendors who sign up before launch

---

## 10. Success Metrics (3 months post-launch)

- 50 paying vendors
- Average subscriber list size per vendor: 150+
- Sentiment response rate: >30%
- Google review click-through from happy path: >20%
- Monthly churn: <5%
- Net Promoter Score: >50

---

*Built with React + Tailwind + Supabase + Twilio + Vercel*
*Rollout v1 — 2026*
