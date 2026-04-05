# Rollout — Database Schema
### Document 03

---

## Overview
Database: Supabase (PostgreSQL)
All tables use UUID primary keys.
Row Level Security (RLS) enabled on all vendor-facing tables.
Timestamps use timestamptz (timezone-aware).

---

## Tables

### vendors
Stores all vendor accounts and configuration.

```sql
create table vendors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  slug text unique not null, -- URL-safe version of name e.g. "tacos-el-rey"
  logo_url text,
  description text,
  google_review_url text,
  notification_time time default '08:00:00', -- local time to send morning SMS
  sentiment_delay_hours int default 2, -- hours after location end to send sentiment SMS
  timezone text default 'America/Phoenix',
  onboarding_complete boolean default false,
  twilio_phone_number text, -- assigned Twilio number for this vendor
  twilio_phone_sid text, -- Twilio phone number SID
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

**Indexes:**
- `user_id` — for auth lookups
- `slug` — for public schedule page routing

**RLS Policy:**
- Vendor can only read/write their own row (user_id = auth.uid())

---

### subscribers
Every customer who has opted into a vendor's SMS list.

```sql
create table subscribers (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references vendors(id) on delete cascade not null,
  phone_number text not null, -- E.164 format e.g. +15205551234
  opted_in_at timestamptz default now(),
  is_active boolean default true, -- false if they replied STOP
  last_sentiment_sent_at timestamptz, -- used for 7-day throttle check
  created_at timestamptz default now(),
  unique(vendor_id, phone_number) -- one subscriber entry per vendor per phone
);
```

**Indexes:**
- `vendor_id` — for fetching all subscribers for a vendor
- `phone_number` — for inbound SMS lookup
- `(vendor_id, phone_number)` — unique constraint + lookup

**RLS Policy:**
- Vendor can only read subscribers belonging to their vendor_id

---

### locations
Every location event a vendor schedules.

```sql
create table locations (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references vendors(id) on delete cascade not null,
  address text not null,
  lat numeric(10, 7),
  lng numeric(10, 7),
  date date not null,
  start_time time not null,
  end_time time not null,
  notes text,
  is_recurring boolean default false,
  recurrence_rule text, -- 'weekly' | 'mon,wed,fri' etc
  morning_sms_sent boolean default false, -- track if morning notification fired
  sentiment_sms_sent boolean default false, -- track if sentiment batch fired
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

**Indexes:**
- `vendor_id` — for fetching vendor's schedule
- `date` — for querying today's locations
- `(vendor_id, date)` — composite for calendar queries

**RLS Policy:**
- Vendor can only CRUD their own locations

---

### sms_log
Every SMS sent or received through the system.

```sql
create table sms_log (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references vendors(id) on delete cascade not null,
  subscriber_id uuid references subscribers(id) on delete set null,
  phone_number text not null, -- redundant with subscriber but kept for orphan records
  message_body text not null,
  direction text not null check (direction in ('outbound', 'inbound')),
  message_type text, -- 'opt_in_confirm' | 'location_notify' | 'sentiment_ask' | 'sentiment_happy' | 'sentiment_unhappy' | 'conversation' | 'blast'
  twilio_message_sid text, -- Twilio message SID for delivery tracking
  status text default 'sent', -- 'sent' | 'delivered' | 'failed' | 'received'
  location_id uuid references locations(id) on delete set null, -- which location triggered this
  created_at timestamptz default now()
);
```

**Indexes:**
- `vendor_id`
- `subscriber_id`
- `phone_number` — for inbound webhook lookup
- `created_at` — for chronological queries
- `message_type` — for analytics queries

**RLS Policy:**
- Vendor can only read logs for their vendor_id

---

### sentiment_responses
Records each customer's reply to a sentiment SMS.

```sql
create table sentiment_responses (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references vendors(id) on delete cascade not null,
  subscriber_id uuid references subscribers(id) on delete cascade not null,
  location_id uuid references locations(id) on delete set null,
  response text not null check (response in ('happy', 'unhappy')),
  raw_reply text, -- the actual text they sent ('1', '2', etc)
  created_at timestamptz default now()
);
```

**Indexes:**
- `vendor_id`
- `subscriber_id`
- `location_id`
- `created_at`

**RLS Policy:**
- Vendor can only read sentiment for their vendor_id

---

### conversations
One conversation thread per unhappy customer interaction.

```sql
create table conversations (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references vendors(id) on delete cascade not null,
  subscriber_id uuid references subscribers(id) on delete cascade not null,
  location_id uuid references locations(id) on delete set null,
  status text default 'open' check (status in ('open', 'resolved')),
  last_message_at timestamptz default now(),
  created_at timestamptz default now()
);
```

**Indexes:**
- `vendor_id`
- `subscriber_id`
- `status` — for filtering open vs resolved
- `last_message_at` — for sorting inbox by recency

**RLS Policy:**
- Vendor can only read/update conversations for their vendor_id

---

### conversation_messages
Individual messages within a conversation thread.

```sql
create table conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade not null,
  body text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  created_at timestamptz default now()
);
```

**Indexes:**
- `conversation_id`
- `created_at`

**RLS Policy:**
- Access via conversation → vendor_id check

---

### subscriber_sms_state
Tracks the current "context" of each subscriber so inbound replies can be routed correctly.

```sql
create table subscriber_sms_state (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references vendors(id) on delete cascade not null,
  subscriber_id uuid references subscribers(id) on delete cascade not null,
  current_state text not null,
  -- States:
  -- 'idle' — no pending reply expected
  -- 'awaiting_sentiment' — waiting for 1 or 2 reply
  -- 'in_conversation' — active complaint conversation open
  active_conversation_id uuid references conversations(id) on delete set null,
  updated_at timestamptz default now(),
  unique(vendor_id, subscriber_id)
);
```

**This is the key routing table.** When Twilio receives an inbound SMS, it looks up this table to know how to handle the reply.

**Indexes:**
- `(vendor_id, subscriber_id)` — primary lookup
- `subscriber_id`

---

### plans
Subscription plan definitions (seeded, not user-created).

```sql
create table plans (
  id uuid primary key default gen_random_uuid(),
  name text not null, -- 'starter' | 'pro' | 'fleet'
  price_monthly int not null, -- in cents (2900, 4900, 9900)
  price_annual int not null, -- in cents (annual total)
  subscriber_limit int not null, -- 200, 1000, 5000
  sms_limit int not null, -- 500, 2500, 10000
  truck_limit int not null, -- 1, 1, 5
  stripe_price_id_monthly text,
  stripe_price_id_annual text
);
```

---

### vendor_subscriptions
Tracks each vendor's current Stripe subscription state.

```sql
create table vendor_subscriptions (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references vendors(id) on delete cascade not null unique,
  plan_id uuid references plans(id),
  stripe_customer_id text,
  stripe_subscription_id text,
  status text default 'trialing',
  -- Stripe statuses: 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete'
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

**Indexes:**
- `vendor_id`
- `stripe_customer_id` — for Stripe webhook lookups
- `stripe_subscription_id` — for Stripe webhook lookups

---

## Seed Data

```sql
-- Insert plans
insert into plans (name, price_monthly, price_annual, subscriber_limit, sms_limit, truck_limit, stripe_price_id_monthly, stripe_price_id_annual)
values
  ('starter', 2900, 27800, 200, 500, 1, 'price_starter_monthly', 'price_starter_annual'),
  ('pro', 4900, 46800, 1000, 2500, 1, 'price_pro_monthly', 'price_pro_annual'),
  ('fleet', 9900, 94800, 5000, 10000, 5, 'price_fleet_monthly', 'price_fleet_annual');
```

---

## Row Level Security Summary

| Table | Policy |
|---|---|
| vendors | user_id = auth.uid() |
| subscribers | vendor_id in (select id from vendors where user_id = auth.uid()) |
| locations | vendor_id in (select id from vendors where user_id = auth.uid()) |
| sms_log | vendor_id in (select id from vendors where user_id = auth.uid()) |
| sentiment_responses | vendor_id in (select id from vendors where user_id = auth.uid()) |
| conversations | vendor_id in (select id from vendors where user_id = auth.uid()) |
| conversation_messages | conversation_id in (select id from conversations where vendor_id in (...)) |
| subscriber_sms_state | vendor_id in (select id from vendors where user_id = auth.uid()) |
| vendor_subscriptions | vendor_id in (select id from vendors where user_id = auth.uid()) |
| plans | public read, no write |

---

## Supabase Realtime
Enable realtime on these tables for live dashboard updates:
- `conversations` — inbox badge updates
- `conversation_messages` — live chat in inbox
- `sentiment_responses` — live sentiment feed on dashboard
- `subscribers` — live subscriber count updates
