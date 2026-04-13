-- Add live location columns to vendors table
alter table public.vendors
  add column if not exists is_live          boolean      not null default false,
  add column if not exists live_lat         double precision,
  add column if not exists live_lng         double precision,
  add column if not exists live_address     text,
  add column if not exists live_updated_at  timestamptz;

-- Enable realtime on vendors so customer page updates instantly
alter publication supabase_realtime add table public.vendors;
