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

  if (!webhookSecret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not set')
    return json({ error: 'Server misconfiguration: STRIPE_WEBHOOK_SECRET not set' }, 500)
  }

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret)
  } catch (err) {
    console.error('[stripe-webhook] signature validation failed:', err.message)
    return json({ error: 'Invalid signature' }, 400)
  }

  // ── [CP2] Init service role client ────────────────────────────────────────
  const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')!
  const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey)

  // ── Handle events ─────────────────────────────────────────────────────────

  switch (event.type) {
    case 'checkout.session.completed': {
      const session        = event.data.object as Stripe.Checkout.Session
      const vendorId       = session.metadata?.vendor_id
      const planName       = session.metadata?.plan_name
      const customerId     = session.customer as string
      const subscriptionId = session.subscription as string

      if (!vendorId || !planName) {
        console.error('[stripe-webhook] missing metadata in checkout session')
        return json({ received: true })
      }

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

      break
    }

    case 'customer.subscription.updated': {
      const sub      = event.data.object as Stripe.Subscription
      const vendorId = sub.metadata?.vendor_id

      if (!vendorId) {
        console.error('[stripe-webhook] no vendor_id in subscription metadata')
        return json({ received: true })
      }

      const status = sub.status === 'active'   ? 'active'
                   : sub.status === 'past_due' ? 'past_due'
                   : sub.status === 'canceled' ? 'canceled'
                   : sub.status === 'trialing' ? 'trialing'
                   : 'incomplete'

      await db.from('vendor_subscriptions')
        .update({
          status,
          current_period_ends_at: new Date(sub.current_period_end * 1000).toISOString(),
          updated_at:             new Date().toISOString(),
        })
        .eq('vendor_id', vendorId)

      break
    }

    case 'customer.subscription.deleted': {
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
      }

      break
    }

    case 'invoice.payment_failed': {
      const invoice        = event.data.object
      const subscriptionId = invoice.subscription
      if (subscriptionId) {
        await db
          .from('vendor_subscriptions')
          .update({ status: 'past_due' })
          .eq('stripe_subscription_id', subscriptionId)
      }
      break
    }

    case 'invoice.payment_succeeded': {
      const invoice        = event.data.object
      const subscriptionId = invoice.subscription
      if (subscriptionId && invoice.lines?.data?.[0]?.period?.end) {
        await db
          .from('vendor_subscriptions')
          .update({
            status: 'active',
            current_period_ends_at: new Date(invoice.lines.data[0].period.end * 1000).toISOString()
          })
          .eq('stripe_subscription_id', subscriptionId)
      }
      break
    }

    case 'customer.subscription.trial_will_end': {
      // Trial ends in 3 days — just log for now, email integration is V2
      console.log('Trial ending soon for subscription:', event.data.object.id)
      break
    }

    default:
      break
  }

  return json({ received: true })
})
