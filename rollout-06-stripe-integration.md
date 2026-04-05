# Rollout — Stripe Integration
### Document 06

---

## Overview
Stripe handles all subscription billing.
Rollout uses Stripe Subscriptions with a 14-day free trial.
No credit card required to start trial.

---

## Stripe Products & Prices
Create these in Stripe Dashboard before launch.

| Product | Monthly Price ID | Annual Price ID | Amount |
|---|---|---|---|
| Rollout Starter | price_starter_monthly | price_starter_annual | $29/mo or $278/yr |
| Rollout Pro | price_pro_monthly | price_pro_annual | $49/mo or $468/yr |
| Rollout Fleet | price_fleet_monthly | price_fleet_annual | $99/mo or $948/yr |

Annual pricing = 2 months free (10 months × monthly rate)

---

## Trial Logic

**Trial period:** 14 days from signup
**Credit card:** NOT required during trial
**Trial end behavior:** Subscription moves to `past_due` → vendor prompted to add card
**Grace period:** 3 days after trial ends before features restricted

**Trial state in database:**
```
vendor_subscriptions.status = 'trialing'
vendor_subscriptions.trial_ends_at = signup_date + 14 days
```

**Feature access during trial:** Full access to all Starter plan features
**Feature access after trial expires (no card):** Dashboard read-only, SMS sending disabled

---

## Subscription Lifecycle

```
Signup
  │
  ▼
Trial Created (status: trialing)
  │
  ├── Trial ends, no card → status: past_due → restrict features → email vendor
  │
  ├── Vendor adds card before trial ends → status: active → billing starts
  │
  └── Vendor adds card after trial ends → status: active → billing starts immediately

Active
  │
  ├── Payment succeeds → status: active → update current_period_ends_at
  │
  ├── Payment fails → status: past_due → email vendor → retry 3x over 7 days
  │     │
  │     ├── Retry succeeds → status: active
  │     └── All retries fail → status: canceled → restrict features
  │
  └── Vendor cancels → status: canceled at period end → access until period_end date

Canceled
  │
  └── Vendor resubscribes → new subscription created → status: active
```

---

## Stripe Webhook Events

### checkout.session.completed
Fired when vendor completes checkout (adds card + selects plan).
```typescript
// Logic:
const session = event.data.object;
const vendorId = session.metadata.vendor_id;
const subscriptionId = session.subscription;

await supabase
  .from('vendor_subscriptions')
  .upsert({
    vendor_id: vendorId,
    stripe_customer_id: session.customer,
    stripe_subscription_id: subscriptionId,
    status: 'active',
    plan_id: getPlanIdFromPriceId(session.metadata.price_id)
  });
```

### customer.subscription.updated
Fired on any subscription change (upgrade, downgrade, renewal).
```typescript
// Update status, plan, period end date
await supabase
  .from('vendor_subscriptions')
  .update({
    status: subscription.status,
    current_period_ends_at: new Date(subscription.current_period_end * 1000),
    plan_id: getPlanIdFromPriceId(subscription.items.data[0].price.id)
  })
  .eq('stripe_subscription_id', subscription.id);
```

### customer.subscription.deleted
Fired when subscription is fully canceled.
```typescript
await supabase
  .from('vendor_subscriptions')
  .update({ status: 'canceled', canceled_at: new Date() })
  .eq('stripe_subscription_id', subscription.id);
// Restrict vendor features
```

### invoice.payment_failed
```typescript
// Update status to past_due
// Send email to vendor: "Payment failed — update your card to keep Rollout running"
```

### invoice.payment_succeeded
```typescript
// Update current_period_ends_at
// If was past_due, restore status to active
```

### customer.subscription.trial_will_end
Fires 3 days before trial ends.
```typescript
// Send email: "Your Rollout trial ends in 3 days — add a card to keep going"
```

---

## Feature Gating Logic
Before sending any SMS, check vendor subscription status.

```typescript
const canSendSMS = async (vendorId: string): Promise<boolean> => {
  const { data } = await supabase
    .from('vendor_subscriptions')
    .select('status, trial_ends_at')
    .eq('vendor_id', vendorId)
    .single();

  if (!data) return false;

  if (data.status === 'active') return true;

  if (data.status === 'trialing') {
    return new Date(data.trial_ends_at) > new Date();
  }

  // past_due: 3 day grace period
  if (data.status === 'past_due') {
    const gracePeriodEnd = new Date(data.trial_ends_at);
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 3);
    return gracePeriodEnd > new Date();
  }

  return false; // canceled, incomplete
};
```

---

## Plan Limit Enforcement

Check before adding subscribers:
```typescript
const canAddSubscriber = async (vendorId: string): Promise<boolean> => {
  const plan = await getVendorPlan(vendorId);
  const subscriberCount = await getActiveSubscriberCount(vendorId);
  return subscriberCount < plan.subscriber_limit;
};
```

Check before sending SMS:
```typescript
const canSendMoreSMS = async (vendorId: string): Promise<boolean> => {
  const plan = await getVendorPlan(vendorId);
  const monthlyCount = await getSMSCountThisMonth(vendorId);
  return monthlyCount < plan.sms_limit;
};
```

If SMS limit hit → stop sending, show warning on dashboard, do not silently drop messages.

---

## Stripe Customer Portal
For billing management (update card, view invoices, cancel):
Use Stripe's hosted Customer Portal — no need to build billing UI from scratch.

```typescript
const createPortalSession = async (stripeCustomerId: string) => {
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: 'https://rollout.app/settings',
  });
  return session.url;
};
```
