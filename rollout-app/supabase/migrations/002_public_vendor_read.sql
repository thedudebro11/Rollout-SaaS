-- Allow anyone to read vendor profiles (needed for public opt-in page /join/[slug])
-- Vendors are only listed once they have a slug (onboarding step 1 complete)
create policy "Vendors: public can read by slug"
  on public.vendors
  for select
  using (slug is not null);
