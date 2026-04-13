-- Link Stripe monthly price IDs to the seeded plans
update public.plans set stripe_monthly_price_id = 'price_1TLgPiHNpFmoFV8XOznZCXew' where name = 'starter';
update public.plans set stripe_monthly_price_id = 'price_1TLgTUHNpFmoFV8Xi8jjYsJH' where name = 'pro';
update public.plans set stripe_monthly_price_id = 'price_1TLgTpHNpFmoFV8XyvC5osl6' where name = 'fleet';
