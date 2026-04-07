-- Allow unauthenticated users to read locations for vendors with completed onboarding.
-- Required for the public schedule page /:slug
--
-- The policy checks through the vendors table to confirm:
--   1. The location belongs to a vendor that has completed onboarding
--   2. The vendor has a slug (i.e. is publicly listed)
--
-- This allows no writes and exposes no private vendor data.

create policy "Locations: public can read for active vendors"
  on public.locations
  for select
  using (
    exists (
      select 1 from public.vendors
      where vendors.id    = locations.vendor_id
        and vendors.onboarding_complete = true
        and vendors.slug  is not null
    )
  );
