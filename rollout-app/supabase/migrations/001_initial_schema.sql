-- ============================================================
-- Rollout v1 — Initial Schema Migration
-- Run this in the Supabase SQL editor (Project → SQL Editor)
-- ============================================================

-- ── Extensions ────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── 1. vendors ─────────────────────────────────────────────
create table public.vendors (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  name                  text not null default '',
  slug                  text unique,                     -- e.g. "tacos-el-rey"
  logo_url              text,
  description           text,
  google_review_url     text,
  notification_time     time not null default '08:00:00', -- morning SMS time
  sentiment_delay_hours int  not null default 2,          -- hours after location end
  timezone              text not null default 'America/Phoenix',
  onboarding_complete   boolean not null default false,
  twilio_phone_number   text,                             -- "+15205551234"
  twilio_phone_sid      text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Each Supabase auth user gets exactly one vendor profile
create unique index vendors_user_id_idx on public.vendors(user_id);

-- ── Helpers ───────────────────────────────────────────────
-- Helper to check if requesting user owns the vendor_id
-- Defined after vendors table exists
create or replace function auth_owns_vendor(v_vendor_id uuid)
returns boolean
language sql
security definer
as $$
  select exists (
    select 1 from public.vendors
    where id = v_vendor_id
      and user_id = auth.uid()
  );
$$;

alter table public.vendors enable row level security;

create policy "Vendor: owner can do everything"
  on public.vendors
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Trigger: auto-update updated_at
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger vendors_updated_at
  before update on public.vendors
  for each row execute procedure update_updated_at();

-- ── 2. subscribers ─────────────────────────────────────────
create table public.subscribers (
  id                     uuid primary key default uuid_generate_v4(),
  vendor_id              uuid not null references public.vendors(id) on delete cascade,
  phone_number           text not null,   -- E.164 format: "+15205551234"
  opted_in_at            timestamptz not null default now(),
  is_active              boolean not null default true,
  last_sentiment_sent_at timestamptz,
  created_at             timestamptz not null default now()
);

-- A phone number can only subscribe to a vendor once
create unique index subscribers_vendor_phone_idx on public.subscribers(vendor_id, phone_number);
create index subscribers_vendor_id_idx on public.subscribers(vendor_id);

alter table public.subscribers enable row level security;

create policy "Subscribers: vendor owner can do everything"
  on public.subscribers
  for all
  using (auth_owns_vendor(vendor_id))
  with check (auth_owns_vendor(vendor_id));

-- ── 3. locations ───────────────────────────────────────────
create table public.locations (
  id                  uuid primary key default uuid_generate_v4(),
  vendor_id           uuid not null references public.vendors(id) on delete cascade,
  address             text not null,
  lat                 double precision,
  lng                 double precision,
  date                date not null,
  start_time          time not null,
  end_time            time not null,
  notes               text,
  is_recurring        boolean not null default false,
  recurrence_rule     text,              -- iCal RRULE string for recurring
  morning_sms_sent    boolean not null default false,
  sentiment_sms_sent  boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index locations_vendor_date_idx on public.locations(vendor_id, date);
create index locations_morning_sms_idx on public.locations(date, morning_sms_sent);
create index locations_sentiment_idx  on public.locations(date, end_time, sentiment_sms_sent);

alter table public.locations enable row level security;

create policy "Locations: vendor owner can do everything"
  on public.locations
  for all
  using (auth_owns_vendor(vendor_id))
  with check (auth_owns_vendor(vendor_id));

create trigger locations_updated_at
  before update on public.locations
  for each row execute procedure update_updated_at();

-- ── 4. sms_log ─────────────────────────────────────────────
create type sms_direction as enum ('inbound', 'outbound');
create type sms_message_type as enum (
  'opt_in_confirm',
  'location_notify',
  'sentiment_ask',
  'sentiment_happy',
  'sentiment_unhappy',
  'sentiment_invalid',
  'idle_reply',
  'vendor_reply',
  'other'
);

create table public.sms_log (
  id                  uuid primary key default uuid_generate_v4(),
  vendor_id           uuid not null references public.vendors(id) on delete cascade,
  subscriber_id       uuid references public.subscribers(id) on delete set null,
  phone_number        text not null,
  message_body        text not null,
  direction           sms_direction not null,
  message_type        sms_message_type not null default 'other',
  twilio_message_sid  text,
  status              text not null default 'sent',  -- sent | failed | delivered
  location_id         uuid references public.locations(id) on delete set null,
  created_at          timestamptz not null default now()
);

create index sms_log_vendor_id_idx    on public.sms_log(vendor_id, created_at desc);
create index sms_log_subscriber_idx   on public.sms_log(subscriber_id, created_at desc);

alter table public.sms_log enable row level security;

create policy "SMS log: vendor owner can read"
  on public.sms_log
  for select
  using (auth_owns_vendor(vendor_id));

-- Edge functions write to sms_log via service role (bypasses RLS)

-- ── 5. sentiment_responses ─────────────────────────────────
create type sentiment_value as enum ('happy', 'unhappy');

create table public.sentiment_responses (
  id            uuid primary key default uuid_generate_v4(),
  vendor_id     uuid not null references public.vendors(id) on delete cascade,
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  location_id   uuid references public.locations(id) on delete set null,
  response      sentiment_value not null,
  raw_reply     text not null,
  created_at    timestamptz not null default now()
);

create index sentiment_vendor_idx     on public.sentiment_responses(vendor_id, created_at desc);
create index sentiment_subscriber_idx on public.sentiment_responses(subscriber_id, created_at desc);

alter table public.sentiment_responses enable row level security;

create policy "Sentiment: vendor owner can read"
  on public.sentiment_responses
  for select
  using (auth_owns_vendor(vendor_id));

-- ── 6. conversations ───────────────────────────────────────
create type conversation_status as enum ('open', 'resolved');

create table public.conversations (
  id              uuid primary key default uuid_generate_v4(),
  vendor_id       uuid not null references public.vendors(id) on delete cascade,
  subscriber_id   uuid not null references public.subscribers(id) on delete cascade,
  location_id     uuid references public.locations(id) on delete set null,
  status          conversation_status not null default 'open',
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index conversations_vendor_status_idx on public.conversations(vendor_id, status, last_message_at desc);

alter table public.conversations enable row level security;

create policy "Conversations: vendor owner can do everything"
  on public.conversations
  for all
  using (auth_owns_vendor(vendor_id))
  with check (auth_owns_vendor(vendor_id));

-- ── 7. conversation_messages ────────────────────────────────
create table public.conversation_messages (
  id              uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  body            text not null,
  direction       sms_direction not null,
  created_at      timestamptz not null default now()
);

create index conv_messages_conv_id_idx on public.conversation_messages(conversation_id, created_at asc);

alter table public.conversation_messages enable row level security;

-- Check ownership via conversations → vendors
create policy "Conv messages: vendor owner can do everything"
  on public.conversation_messages
  for all
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and auth_owns_vendor(c.vendor_id)
    )
  )
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and auth_owns_vendor(c.vendor_id)
    )
  );

-- ── 8. subscriber_sms_state ────────────────────────────────
-- The state machine — tracks where each subscriber is in the SMS flow
create type sms_state as enum ('idle', 'awaiting_sentiment', 'in_conversation');

create table public.subscriber_sms_state (
  id                      uuid primary key default uuid_generate_v4(),
  vendor_id               uuid not null references public.vendors(id) on delete cascade,
  subscriber_id           uuid not null references public.subscribers(id) on delete cascade,
  current_state           sms_state not null default 'idle',
  active_conversation_id  uuid references public.conversations(id) on delete set null,
  updated_at              timestamptz not null default now()
);

create unique index sms_state_vendor_subscriber_idx on public.subscriber_sms_state(vendor_id, subscriber_id);

alter table public.subscriber_sms_state enable row level security;

create policy "SMS state: vendor owner can read"
  on public.subscriber_sms_state
  for select
  using (auth_owns_vendor(vendor_id));

-- Edge functions manage state via service role

-- ── 9. plans ───────────────────────────────────────────────
create table public.plans (
  id                      uuid primary key default uuid_generate_v4(),
  name                    text not null unique,  -- 'starter' | 'pro' | 'fleet'
  price_monthly           int  not null,         -- cents
  price_annual            int  not null,         -- cents/month
  subscriber_limit        int  not null,
  sms_limit               int  not null,         -- per month
  truck_limit             int  not null default 1,
  stripe_monthly_price_id text,
  stripe_annual_price_id  text,
  created_at              timestamptz not null default now()
);

-- Seed the three plans
insert into public.plans (name, price_monthly, price_annual, subscriber_limit, sms_limit, truck_limit)
values
  ('starter', 2900, 2317, 200,   500,   1),
  ('pro',     4900, 3900, 1000,  2500,  1),
  ('fleet',   9900, 7900, 5000,  10000, 5);

alter table public.plans enable row level security;

-- Plans are public read — anyone can see plan details
create policy "Plans: anyone can read"
  on public.plans
  for select
  using (true);

-- ── 10. vendor_subscriptions ───────────────────────────────
create type subscription_status as enum (
  'trialing', 'active', 'past_due', 'canceled', 'incomplete'
);

create table public.vendor_subscriptions (
  id                      uuid primary key default uuid_generate_v4(),
  vendor_id               uuid not null references public.vendors(id) on delete cascade,
  plan_id                 uuid references public.plans(id),
  stripe_customer_id      text,
  stripe_subscription_id  text unique,
  status                  subscription_status not null default 'trialing',
  trial_ends_at           timestamptz,
  current_period_ends_at  timestamptz,
  canceled_at             timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create unique index vendor_subscriptions_vendor_idx on public.vendor_subscriptions(vendor_id);

alter table public.vendor_subscriptions enable row level security;

create policy "Subscriptions: vendor owner can read"
  on public.vendor_subscriptions
  for select
  using (auth_owns_vendor(vendor_id));

create trigger vendor_subscriptions_updated_at
  before update on public.vendor_subscriptions
  for each row execute procedure update_updated_at();

-- ── Supabase Realtime ──────────────────────────────────────
-- Enable realtime publication for live updates in the inbox + dashboard
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.conversation_messages;
alter publication supabase_realtime add table public.sentiment_responses;
alter publication supabase_realtime add table public.subscribers;

-- ── Auto-create vendor profile on signup ───────────────────
-- When a new user signs up, create their vendor row and a 14-day trial
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendor_id uuid;
  v_starter_plan_id uuid;
begin
  -- Create vendor profile
  insert into public.vendors (user_id)
  values (new.id)
  returning id into v_vendor_id;

  -- Look up starter plan
  select id into v_starter_plan_id from public.plans where name = 'starter';

  -- Create trial subscription
  insert into public.vendor_subscriptions (
    vendor_id,
    plan_id,
    status,
    trial_ends_at
  ) values (
    v_vendor_id,
    v_starter_plan_id,
    'trialing',
    now() + interval '14 days'
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Done ────────────────────────────────────────────────────
-- Schema is complete. Next steps:
-- 1. Set up Supabase Storage bucket "vendor-logos" (public read)
-- 2. Configure Twilio webhook URL to: {supabase_url}/functions/v1/twilio-inbound
-- 3. Configure Stripe webhook URL to: {supabase_url}/functions/v1/stripe-webhook
