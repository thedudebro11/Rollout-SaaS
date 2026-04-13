import { useState, useEffect } from 'react'
import { Check, Loader2, Zap, CreditCard, AlertTriangle } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// ── Plan definitions (matches DB seed) ───────────────────────────────────────

const PLANS = [
  {
    name:      'starter',
    label:     'Starter',
    price:     29,
    features:  ['200 subscribers', '500 SMS / month', '1 truck'],
  },
  {
    name:      'pro',
    label:     'Pro',
    price:     49,
    features:  ['1,000 subscribers', '2,500 SMS / month', '1 truck'],
    popular:   true,
  },
  {
    name:      'fleet',
    label:     'Fleet',
    price:     99,
    features:  ['5,000 subscribers', '10,000 SMS / month', 'Up to 5 trucks'],
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(iso) {
  if (!iso) return 0
  const diff = new Date(iso).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / 86400000))
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// ── Status Banner ─────────────────────────────────────────────────────────────

function StatusBanner({ subscription }) {
  if (!subscription) return null

  const { status, trial_ends_at, current_period_ends_at, plan } = subscription

  if (status === 'trialing') {
    const days = daysUntil(trial_ends_at)
    return (
      <div className="bg-accent-muted border border-accent/20 rounded-xl px-5 py-4 flex items-start gap-3 mb-8">
        <Zap size={18} className="text-accent flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-text-primary font-body text-sm font-semibold">
            Free trial — {days} day{days !== 1 ? 's' : ''} remaining
          </p>
          <p className="text-text-secondary font-body text-xs mt-0.5">
            Trial ends {formatDate(trial_ends_at)}. Upgrade to keep your subscribers and automations running.
          </p>
        </div>
      </div>
    )
  }

  if (status === 'active') {
    return (
      <div className="bg-success-muted border border-success/20 rounded-xl px-5 py-4 flex items-start gap-3 mb-8">
        <Check size={18} className="text-success flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-text-primary font-body text-sm font-semibold">
            {plan?.label ?? 'Active'} plan — active
          </p>
          <p className="text-text-secondary font-body text-xs mt-0.5">
            Next billing date: {formatDate(current_period_ends_at)}
          </p>
        </div>
      </div>
    )
  }

  if (status === 'past_due') {
    return (
      <div className="bg-error-muted border border-error/20 rounded-xl px-5 py-4 flex items-start gap-3 mb-8">
        <AlertTriangle size={18} className="text-error flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-text-primary font-body text-sm font-semibold">Payment past due</p>
          <p className="text-text-secondary font-body text-xs mt-0.5">
            Please update your payment method to keep your account active.
          </p>
        </div>
      </div>
    )
  }

  if (status === 'canceled') {
    return (
      <div className="bg-surface-raised border border-border rounded-xl px-5 py-4 flex items-start gap-3 mb-8">
        <CreditCard size={18} className="text-text-tertiary flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-text-primary font-body text-sm font-semibold">Subscription canceled</p>
          <p className="text-text-secondary font-body text-xs mt-0.5">
            Choose a plan below to reactivate your account.
          </p>
        </div>
      </div>
    )
  }

  return null
}

// ── Plan Card ─────────────────────────────────────────────────────────────────

function PlanCard({ plan, currentPlanName, onUpgrade, upgrading }) {
  const isCurrent  = currentPlanName === plan.name
  const isUpgrading = upgrading === plan.name

  return (
    <div className={`relative bg-surface border rounded-xl p-6 flex flex-col ${
      plan.popular
        ? 'border-accent shadow-lg shadow-accent/10'
        : isCurrent
          ? 'border-success'
          : 'border-border'
    }`}>
      {/* Popular badge */}
      {plan.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-accent text-white text-xs font-body font-semibold px-3 py-1 rounded-full">
            Most popular
          </span>
        </div>
      )}

      {/* Current badge */}
      {isCurrent && (
        <div className="absolute -top-3 right-4">
          <span className="bg-success text-white text-xs font-body font-semibold px-3 py-1 rounded-full">
            Current plan
          </span>
        </div>
      )}

      <div className="mb-4">
        <h3 className="font-display font-bold text-lg text-text-primary">{plan.label}</h3>
        <div className="flex items-baseline gap-1 mt-1">
          <span className="font-display font-bold text-3xl text-text-primary">${plan.price}</span>
          <span className="text-text-tertiary font-body text-sm">/month</span>
        </div>
      </div>

      <ul className="flex flex-col gap-2.5 mb-6 flex-1">
        {plan.features.map(f => (
          <li key={f} className="flex items-center gap-2.5">
            <Check size={14} className="text-success flex-shrink-0" />
            <span className="text-text-secondary font-body text-sm">{f}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={() => !isCurrent && onUpgrade(plan.name)}
        disabled={isCurrent || isUpgrading}
        className={`w-full py-2.5 rounded-lg text-sm font-body font-semibold transition-colors flex items-center justify-center gap-2 ${
          isCurrent
            ? 'bg-surface-raised text-text-tertiary cursor-default'
            : plan.popular
              ? 'bg-accent hover:bg-accent-hover text-white disabled:opacity-50'
              : 'bg-surface-raised hover:bg-border text-text-primary border border-border disabled:opacity-50'
        }`}
      >
        {isUpgrading && <Loader2 size={14} className="animate-spin" />}
        {isCurrent ? 'Current plan' : `Upgrade to ${plan.label}`}
      </button>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function BillingPage() {
  const { vendor }            = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const [loading, setLoading]         = useState(true)
  const [subscription, setSubscription] = useState(null)
  const [upgrading, setUpgrading]     = useState(null)
  const [successMsg, setSuccessMsg]   = useState('')

  useEffect(() => {
    if (vendor) loadSubscription()

    // Handle Stripe redirect back with ?success=true
    if (searchParams.get('success') === 'true') {
      const plan = searchParams.get('plan') ?? ''
      setSuccessMsg(`You're now on the ${plan.charAt(0).toUpperCase() + plan.slice(1)} plan!`)
      setSearchParams({})  // Clean up URL
    }
  }, [vendor])

  async function loadSubscription() {
    setLoading(true)
    const { data } = await supabase
      .from('vendor_subscriptions')
      .select('*, plans(name, price_monthly)')
      .eq('vendor_id', vendor.id)
      .single()

    if (data) {
      setSubscription({
        ...data,
        plan: data.plans ? {
          name:  data.plans.name,
          label: PLANS.find(p => p.name === data.plans.name)?.label ?? data.plans.name,
        } : null,
      })
    }
    setLoading(false)
  }

  async function handleUpgrade(planName) {
    setUpgrading(planName)
    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: { plan_name: planName },
    })

    if (error || !data?.url) {
      console.error('checkout error:', error)
      setUpgrading(null)
      return
    }

    // Redirect to Stripe Checkout
    window.location.href = data.url
  }

  const currentPlanName = subscription?.plans?.name ?? null

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-text-tertiary" />
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">

      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display font-bold text-2xl text-text-primary">Billing</h1>
        <p className="text-text-secondary font-body text-sm mt-0.5">
          Manage your Rollout subscription.
        </p>
      </div>

      {/* Success message */}
      {successMsg && (
        <div className="bg-success-muted border border-success/20 rounded-xl px-5 py-4 flex items-center gap-3 mb-8">
          <Check size={18} className="text-success flex-shrink-0" />
          <p className="text-text-primary font-body text-sm font-semibold">{successMsg} Welcome aboard!</p>
        </div>
      )}

      {/* Status banner */}
      <StatusBanner subscription={subscription} />

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map(plan => (
          <PlanCard
            key={plan.name}
            plan={plan}
            currentPlanName={currentPlanName}
            onUpgrade={handleUpgrade}
            upgrading={upgrading}
          />
        ))}
      </div>

      {/* Footer note */}
      <p className="text-text-tertiary font-body text-xs text-center mt-8">
        All plans include a 14-day free trial. Cancel anytime. Payments processed securely by Stripe.
      </p>
    </div>
  )
}
