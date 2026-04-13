// @ts-nocheck — Deno runtime file, not processed by Node/browser TypeScript

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok')
  if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405)

  // ── [CP1] Validate Stripe signature ───────────────────────────────────────
  const stripeKey     = Deno.env.get('STRIPE_SECRET_KEY')!
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  const stripe        = new Stripe(stripeKey, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  })

  const body      = await req.text()
  const sig       = req.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    if (webhookSecret) {
      event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret)
    } else {
      // Dev mode: skip signature validation if secret not set yet
      console.warn('[CP1] STRIPE_WEBHOOK_SECRET not set — skipping signature validation')
      event = JSON.parse(body)
    }
  } catch (err) {
    console.error('[CP1] signature validation failed:', err.message)
    return json({ error: 'Invalid signature' }, 400)
  }

  console.log(`[CP1] event: ${event.type}`)

  // ── [CP2] Init service role client ────────────────────────────────────────
  const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')!
  const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey)

  // ── [CP3] Handle events ───────────────────────────────────────────────────

  if (event.type === 'checkout.session.completed') {
    const session      = event.data.object as Stripe.Checkout.Session
    const vendorId     = session.metadata?.vendor_id
    const planName     = session.metadata?.plan_name
    const customerId   = session.customer as string
    const subscriptionId = session.subscription as string

    if (!vendorId || !planName) {
      console.error('[CP3] missing metadata in checkout session')
      return json({ received: true })
    }

    console.log(`[CP3] checkout completed — vendor: ${vendorId}, plan: ${planName}`)

    // Get the plan id
    const { data: plan } = await db
      .from('plans')
      .select('id')
      .eq('name', planName)
      .single()

    // Get full subscription to get period end
    const stripeSub = await stripe.subscriptions.retrieve(subscriptionId)

    await db.from('vendor_subscriptions')
      .update({
        stripe_customer_id:     customerId,
        stripe_subscription_id: subscriptionId,
        plan_id:                plan?.id ?? null,
        status:                 'active',
        trial_ends_at:          null,
        current_period_ends_at: new Date(stripeSub.current_period_end * 1000).toISOString(),
        updated_at:             new Date().toISOString(),
      })
      .eq('vendor_id', vendorId)

    console.log('[CP3] vendor_subscriptions updated to active')
  }

  else if (event.type === 'customer.subscription.updated') {
    const sub      = event.data.object as Stripe.Subscription
    const vendorId = sub.metadata?.vendor_id

    if (!vendorId) {
      console.error('[CP3] no vendor_id in subscription metadata')
      return json({ received: true })
    }

    const status = sub.status === 'active'    ? 'active'
                 : sub.status === 'past_due'  ? 'past_due'
                 : sub.status === 'canceled'  ? 'canceled'
                 : sub.status === 'trialing'  ? 'trialing'
                 : 'incomplete'

    await db.from('vendor_subscriptions')
      .update({
        status,
        current_period_ends_at: new Date(sub.current_period_end * 1000).toISOString(),
        updated_at:             new Date().toISOString(),
      })
      .eq('vendor_id', vendorId)

    console.log(`[CP3] subscription updated — vendor: ${vendorId}, status: ${status}`)
  }

  else if (event.type === 'customer.subscription.deleted') {
    const sub      = event.data.object as Stripe.Subscription
    const vendorId = sub.metadata?.vendor_id

    if (vendorId) {
      await db.from('vendor_subscriptions')
        .update({
          status:      'canceled',
          canceled_at: new Date().toISOString(),
          updated_at:  new Date().toISOString(),
        })
        .eq('vendor_id', vendorId)

      console.log(`[CP3] subscription canceled — vendor: ${vendorId}`)
    }
  }

  else {
    console.log(`[CP3] unhandled event type: ${event.type}`)
  }

  return json({ received: true })
})
