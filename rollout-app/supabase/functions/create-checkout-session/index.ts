// @ts-nocheck — Deno runtime file, not processed by Node/browser TypeScript

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405)

  // ── [CP1] Auth ────────────────────────────────────────────────────────────
  const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
  const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY')!

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user }, error: authErr } = await anonClient.auth.getUser()
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)
  console.log('[CP1] user:', user.id)

  // ── [CP2] Parse body ──────────────────────────────────────────────────────
  const { plan_name } = await req.json()
  if (!['starter', 'pro', 'fleet'].includes(plan_name)) {
    return json({ error: 'Invalid plan_name' }, 400)
  }

  // ── [CP3] Init service role client ────────────────────────────────────────
  const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')!
  const db = createClient(SUPABASE_URL, serviceRoleKey)

  // ── [CP4] Get vendor + current subscription ───────────────────────────────
  const { data: vendor } = await db
    .from('vendors')
    .select('id, name')
    .eq('user_id', user.id)
    .single()

  if (!vendor) return json({ error: 'Vendor not found' }, 404)

  const { data: subscription } = await db
    .from('vendor_subscriptions')
    .select('stripe_customer_id')
    .eq('vendor_id', vendor.id)
    .single()

  // ── [CP5] Get plan price ID ───────────────────────────────────────────────
  const { data: plan } = await db
    .from('plans')
    .select('id, stripe_monthly_price_id')
    .eq('name', plan_name)
    .single()

  if (!plan?.stripe_monthly_price_id) {
    return json({ error: 'Plan price not configured' }, 500)
  }

  console.log(`[CP5] plan: ${plan_name}, price: ${plan.stripe_monthly_price_id}`)

  // ── [CP6] Create Stripe Checkout session ──────────────────────────────────
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!
  const stripe    = new Stripe(stripeKey, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  })

  const frontendUrl = Deno.env.get('FRONTEND_URL') ?? 'http://localhost:5173'

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode:                 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: plan.stripe_monthly_price_id, quantity: 1 }],
    success_url: `${frontendUrl}/billing?success=true&plan=${plan_name}`,
    cancel_url:  `${frontendUrl}/billing`,
    metadata:    { vendor_id: vendor.id, plan_name },
    subscription_data: {
      metadata: { vendor_id: vendor.id, plan_name },
    },
  }

  // Re-use existing Stripe customer if they have one
  if (subscription?.stripe_customer_id) {
    sessionParams.customer = subscription.stripe_customer_id
  } else {
    sessionParams.customer_email = user.email
  }

  const session = await stripe.checkout.sessions.create(sessionParams)
  console.log('[CP6] checkout session created:', session.id)

  return json({ url: session.url })
})
