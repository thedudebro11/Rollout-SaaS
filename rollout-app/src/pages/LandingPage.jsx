import { Link } from 'react-router-dom'

// ── Navbar ────────────────────────────────────────────────────────────────────

function Navbar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0a]/90 backdrop-blur-sm border-b border-[#2a2a2a]/60">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <span style={{ fontFamily: 'Syne, sans-serif' }} className="font-bold text-xl text-[#f5f5f5] tracking-tight">
          rollout<span className="text-[#FF6B35]">.</span>
        </span>

        {/* Nav actions */}
        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="px-4 py-2 text-sm font-medium text-[#888888] hover:text-[#f5f5f5] border border-[#2a2a2a] hover:border-[#3a3a3a] rounded-lg transition-all"
            style={{ fontFamily: 'DM Sans, sans-serif' }}
          >
            Sign In
          </Link>
          <Link
            to="/signup"
            className="px-4 py-2 text-sm font-medium bg-[#FF6B35] text-[#0a0a0a] rounded-lg hover:bg-[#ff7d4d] transition-all"
            style={{ fontFamily: 'DM Sans, sans-serif' }}
          >
            Start Free Trial
          </Link>
        </div>
      </div>
    </header>
  )
}

// ── Hero Section ──────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative pt-32 pb-24 px-6 overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full opacity-20"
          style={{ background: 'radial-gradient(ellipse at center, #FF6B35 0%, transparent 70%)' }}
        />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 60%, #0a0a0a 100%)' }} />
      </div>

      <div className="relative max-w-4xl mx-auto text-center">
        {/* Eyebrow pill */}
        <div className="inline-flex items-center gap-2 bg-[#141414] border border-[#2a2a2a] rounded-full px-4 py-1.5 mb-8">
          <span className="w-2 h-2 rounded-full bg-[#FF6B35] animate-pulse" />
          <span className="text-xs font-medium text-[#888888]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            Built for food truck operators
          </span>
        </div>

        {/* Headline */}
        <h1
          style={{ fontFamily: 'Syne, sans-serif', fontSize: 'clamp(40px, 7vw, 72px)', lineHeight: '1.08', fontWeight: 700 }}
          className="text-[#f5f5f5] mb-6 tracking-tight"
        >
          Your food truck's<br />
          <span className="text-[#FF6B35]">command center.</span>
        </h1>

        {/* Sub-headline */}
        <p
          className="text-[#888888] mb-10 max-w-xl mx-auto leading-relaxed"
          style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '18px' }}
        >
          Schedule locations. Notify subscribers. Protect your reputation — automatically.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/signup"
            className="px-7 py-3.5 text-base font-semibold bg-[#FF6B35] text-[#0a0a0a] rounded-lg hover:bg-[#ff7d4d] transition-all shadow-lg shadow-[#FF6B35]/20 w-full sm:w-auto text-center"
            style={{ fontFamily: 'DM Sans, sans-serif' }}
          >
            Start Free Trial →
          </Link>
          <a
            href="#how-it-works"
            className="px-7 py-3.5 text-base font-semibold text-[#888888] hover:text-[#f5f5f5] border border-[#2a2a2a] hover:border-[#3a3a3a] rounded-lg transition-all w-full sm:w-auto text-center"
            style={{ fontFamily: 'DM Sans, sans-serif' }}
          >
            See how it works
          </a>
        </div>

        {/* Social proof note */}
        <p className="mt-6 text-xs text-[#555555]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
          14-day free trial · No credit card required
        </p>
      </div>
    </section>
  )
}

// ── Stats Row ─────────────────────────────────────────────────────────────────

function StatsRow() {
  const stats = [
    { value: '< 5 min',  label: 'to set up your first location' },
    { value: '100%',     label: 'SMS delivery, no app needed' },
    { value: '0 code',   label: 'required to run your program' },
  ]

  return (
    <section className="py-10 border-y border-[#2a2a2a]">
      <div className="max-w-4xl mx-auto px-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {stats.map(({ value, label }) => (
            <div key={value} className="text-center">
              <p
                className="text-[#FF6B35] mb-1.5"
                style={{ fontFamily: 'DM Mono, monospace', fontSize: '28px', fontWeight: 600 }}
              >
                {value}
              </p>
              <p className="text-[#888888] text-sm" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                {label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── How It Works ──────────────────────────────────────────────────────────────

function HowItWorks() {
  const steps = [
    {
      emoji: '📍',
      step: '01',
      title: 'Schedule your stops',
      body: 'Log your locations for the week. One-time spots or recurring routes — Rollout keeps track of it all.',
    },
    {
      emoji: '💬',
      step: '02',
      title: 'Subscribers get the text',
      body: "When you're rolling out, your fans get an SMS automatically. No app needed. Just texts.",
    },
    {
      emoji: '⭐',
      step: '03',
      title: 'Capture reviews, catch complaints',
      body: 'After each visit, Rollout asks how it went. Happy customers go to Google. Unhappy ones come to you first.',
    },
  ]

  return (
    <section id="how-it-works" className="py-24 px-6">
      <div className="max-w-5xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-14">
          <p className="text-[#FF6B35] text-xs font-semibold uppercase tracking-widest mb-3" style={{ fontFamily: 'DM Mono, monospace' }}>
            How it works
          </p>
          <h2
            className="text-[#f5f5f5] tracking-tight"
            style={{ fontFamily: 'Syne, sans-serif', fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 700 }}
          >
            Three steps. Runs itself.
          </h2>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {steps.map(({ emoji, step, title, body }) => (
            <div
              key={step}
              className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-6 flex flex-col gap-4 hover:border-[#FF6B35]/30 transition-colors group"
            >
              <div className="flex items-center justify-between">
                <span className="text-3xl">{emoji}</span>
                <span
                  className="text-[#2a2a2a] group-hover:text-[#FF6B35]/20 transition-colors"
                  style={{ fontFamily: 'DM Mono, monospace', fontSize: '13px', fontWeight: 600 }}
                >
                  {step}
                </span>
              </div>
              <div>
                <h3
                  className="text-[#f5f5f5] mb-2"
                  style={{ fontFamily: 'Syne, sans-serif', fontSize: '17px', fontWeight: 600 }}
                >
                  {title}
                </h3>
                <p className="text-[#888888] text-sm leading-relaxed" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                  {body}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Connector line (desktop only) */}
        <div className="hidden md:flex items-center justify-center gap-0 mt-8 px-12 pointer-events-none select-none">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent to-[#FF6B35]/30" />
          <div className="w-2 h-2 rounded-full bg-[#FF6B35]/40" />
          <div className="flex-1 h-px bg-[#FF6B35]/30" />
          <div className="w-2 h-2 rounded-full bg-[#FF6B35]/40" />
          <div className="flex-1 h-px bg-gradient-to-l from-transparent to-[#FF6B35]/30" />
        </div>
      </div>
    </section>
  )
}

// ── Feature Detail — mock card UI ─────────────────────────────────────────────

function MockLocationCard() {
  return (
    <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-5 select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span style={{ fontFamily: 'Syne, sans-serif' }} className="text-[#f5f5f5] font-semibold text-sm">
          Today's Schedule
        </span>
        <span className="text-[#FF6B35] text-xs font-medium" style={{ fontFamily: 'DM Sans, sans-serif' }}>Live</span>
      </div>
      {/* Location rows */}
      {[
        { addr: 'Downtown Food Park · 4th & Main', time: '11:00 AM – 2:00 PM', sent: true },
        { addr: 'Westside Farmers Market', time: '5:00 PM – 8:00 PM', sent: false },
      ].map(({ addr, time, sent }) => (
        <div key={addr} className="flex items-start gap-3 py-3 border-b border-[#1f1f1f] last:border-0">
          <div className="w-7 h-7 rounded-lg bg-[#FF6B35]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-sm">📍</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[#f5f5f5] text-xs font-medium truncate" style={{ fontFamily: 'DM Sans, sans-serif' }}>{addr}</p>
            <p className="text-[#555555] text-xs mt-0.5" style={{ fontFamily: 'DM Mono, monospace' }}>{time}</p>
          </div>
          {sent && (
            <span className="text-[10px] font-medium text-[#22c55e] bg-[rgba(34,197,94,0.12)] px-2 py-0.5 rounded-full flex-shrink-0" style={{ fontFamily: 'DM Sans, sans-serif' }}>
              SMS sent
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function MockInboxCard() {
  return (
    <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-5 select-none">
      <div className="flex items-center justify-between mb-4">
        <span style={{ fontFamily: 'Syne, sans-serif' }} className="text-[#f5f5f5] font-semibold text-sm">
          Inbox
        </span>
        <span className="bg-[#FF6B35] text-[#0a0a0a] text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ fontFamily: 'DM Mono, monospace' }}>
          2 open
        </span>
      </div>
      {/* Conversation preview */}
      <div className="space-y-2">
        {[
          { msg: '"The wait was really long today..."', time: '2m ago', status: 'new' },
          { msg: '"Got the wrong order, but otherwise loved it"', time: '18m ago', status: 'open' },
        ].map(({ msg, time, status }) => (
          <div key={msg} className="flex items-start gap-3 p-3 bg-[#1c1c1c] rounded-lg">
            <div className="w-7 h-7 rounded-full bg-[#FF6B35]/20 flex items-center justify-center flex-shrink-0 text-sm">
              💬
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[#888888] text-xs leading-snug truncate" style={{ fontFamily: 'DM Sans, sans-serif' }}>{msg}</p>
              <p className="text-[#555555] text-[10px] mt-1" style={{ fontFamily: 'DM Mono, monospace' }}>{time}</p>
            </div>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${status === 'new' ? 'text-[#FF6B35] bg-[#FF6B35]/10' : 'text-[#555555] bg-[#1c1c1c] border border-[#2a2a2a]'}`} style={{ fontFamily: 'DM Sans, sans-serif' }}>
              {status}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Features() {
  return (
    <section className="py-24 px-6 bg-[#141414]/40">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-[#FF6B35] text-xs font-semibold uppercase tracking-widest mb-3" style={{ fontFamily: 'DM Mono, monospace' }}>
            Features
          </p>
          <h2
            className="text-[#f5f5f5] tracking-tight"
            style={{ fontFamily: 'Syne, sans-serif', fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 700 }}
          >
            Everything you need.<br />Nothing you don't.
          </h2>
        </div>

        {/* Feature 1 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center mb-20">
          <div>
            <div className="inline-flex items-center gap-2 bg-[#1c1c1c] border border-[#2a2a2a] rounded-full px-3 py-1 mb-5">
              <span className="text-sm">📍</span>
              <span className="text-xs text-[#888888]" style={{ fontFamily: 'DM Sans, sans-serif' }}>Live Location Widget</span>
            </div>
            <h3
              className="text-[#f5f5f5] mb-4 tracking-tight"
              style={{ fontFamily: 'Syne, sans-serif', fontSize: '26px', fontWeight: 700 }}
            >
              Your fans always know where you are.
            </h3>
            <p className="text-[#888888] leading-relaxed mb-6" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '15px' }}>
              Your fans can check if you're out today from a public page. Put a QR code on your truck window — they scan it, bookmark it, done. No app download, no social media algorithm, no guesswork.
            </p>
            <ul className="space-y-2">
              {['Public schedule page at rollout.app/your-name', 'Auto-updates when you add locations', 'QR code ready to print'].map(item => (
                <li key={item} className="flex items-center gap-2.5 text-sm text-[#888888]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                  <span className="w-4 h-4 rounded-full bg-[#FF6B35]/15 flex items-center justify-center flex-shrink-0 text-[10px]">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="order-first md:order-last">
            <MockLocationCard />
          </div>
        </div>

        {/* Feature 2 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <div>
            <MockInboxCard />
          </div>
          <div>
            <div className="inline-flex items-center gap-2 bg-[#1c1c1c] border border-[#2a2a2a] rounded-full px-3 py-1 mb-5">
              <span className="text-sm">🛡️</span>
              <span className="text-xs text-[#888888]" style={{ fontFamily: 'DM Sans, sans-serif' }}>Private Inbox</span>
            </div>
            <h3
              className="text-[#f5f5f5] mb-4 tracking-tight"
              style={{ fontFamily: 'Syne, sans-serif', fontSize: '26px', fontWeight: 700 }}
            >
              Bad reviews never have to go public.
            </h3>
            <p className="text-[#888888] leading-relaxed mb-6" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '15px' }}>
              When a customer is unhappy, Rollout routes them to a private inbox — not a Yelp review page. You get a notification, you reply, you fix it. The complaint stays between you and the customer.
            </p>
            <ul className="space-y-2">
              {['Unhappy customers come to you first', 'Reply via dashboard — they get an SMS', 'Resolve and close threads'].map(item => (
                <li key={item} className="flex items-center gap-2.5 text-sm text-[#888888]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                  <span className="w-4 h-4 rounded-full bg-[#FF6B35]/15 flex items-center justify-center flex-shrink-0 text-[10px]">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Pricing Section ───────────────────────────────────────────────────────────

function PricingCard({ name, price, desc, features, highlighted, cta }) {
  return (
    <div
      className={`relative flex flex-col rounded-xl p-7 transition-all ${
        highlighted
          ? 'bg-[#141414] border-2 border-[#FF6B35]'
          : 'bg-[#141414] border border-[#2a2a2a]'
      }`}
    >
      {highlighted && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <span className="bg-[#FF6B35] text-[#0a0a0a] text-xs font-bold px-3 py-1 rounded-full" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            Most popular
          </span>
        </div>
      )}

      <div className="mb-6">
        <h3
          className="text-[#f5f5f5] mb-1"
          style={{ fontFamily: 'Syne, sans-serif', fontSize: '20px', fontWeight: 700 }}
        >
          {name}
        </h3>
        {desc && <p className="text-[#888888] text-xs mb-4" style={{ fontFamily: 'DM Sans, sans-serif' }}>{desc}</p>}
        <div className="flex items-end gap-1">
          <span
            className="text-[#f5f5f5]"
            style={{ fontFamily: 'DM Mono, monospace', fontSize: '40px', fontWeight: 600, lineHeight: 1 }}
          >
            {price}
          </span>
          <span className="text-[#555555] text-sm mb-1.5" style={{ fontFamily: 'DM Sans, sans-serif' }}>/mo</span>
        </div>
      </div>

      <ul className="flex flex-col gap-2.5 mb-8 flex-1">
        {features.map(f => (
          <li key={f} className="flex items-start gap-2.5 text-sm" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            <span className="text-[#FF6B35] flex-shrink-0 mt-0.5">✓</span>
            <span className={f.includes('coming soon') ? 'text-[#555555]' : 'text-[#888888]'}>{f}</span>
          </li>
        ))}
      </ul>

      <Link
        to="/signup"
        className={`w-full py-3 text-sm font-semibold text-center rounded-lg transition-all ${
          highlighted
            ? 'bg-[#FF6B35] text-[#0a0a0a] hover:bg-[#ff7d4d] shadow-lg shadow-[#FF6B35]/20'
            : 'border border-[#2a2a2a] text-[#888888] hover:text-[#f5f5f5] hover:border-[#3a3a3a]'
        }`}
        style={{ fontFamily: 'DM Sans, sans-serif' }}
      >
        {cta}
      </Link>
    </div>
  )
}

function Pricing() {
  const plans = [
    {
      name: 'Starter',
      price: '$29',
      desc: 'Perfect for solo operators',
      highlighted: false,
      cta: 'Start Free Trial',
      features: [
        '500 SMS/month',
        'Up to 250 subscribers',
        'Morning SMS notifications',
        'QR code opt-in',
        'Sentiment routing',
        'Conversation inbox',
      ],
    },
    {
      name: 'Growth',
      price: '$79',
      desc: 'For trucks ready to scale',
      highlighted: true,
      cta: 'Start Free Trial',
      features: [
        '2,000 SMS/month',
        'Up to 1,000 subscribers',
        'Everything in Starter',
        'Fleet-ready (coming soon)',
        'Priority support',
      ],
    },
  ]

  return (
    <section id="pricing" className="py-24 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-[#FF6B35] text-xs font-semibold uppercase tracking-widest mb-3" style={{ fontFamily: 'DM Mono, monospace' }}>
            Pricing
          </p>
          <h2
            className="text-[#f5f5f5] tracking-tight mb-4"
            style={{ fontFamily: 'Syne, sans-serif', fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 700 }}
          >
            Simple, flat-rate pricing.
          </h2>
          <p className="text-[#888888]" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '15px' }}>
            No per-SMS surprises. No hidden fees. Cancel anytime.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {plans.map(plan => (
            <PricingCard key={plan.name} {...plan} />
          ))}
        </div>

        <p className="text-center text-[#555555] text-sm mt-8" style={{ fontFamily: 'DM Sans, sans-serif' }}>
          14-day free trial on all plans · No credit card required
        </p>
      </div>
    </section>
  )
}

// ── Final CTA ─────────────────────────────────────────────────────────────────

function FinalCTA() {
  return (
    <section className="py-20 px-6">
      <div className="max-w-2xl mx-auto text-center">
        <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-10 relative overflow-hidden">
          {/* Subtle glow */}
          <div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-64 h-32 rounded-full opacity-20 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at center, #FF6B35 0%, transparent 70%)' }}
          />
          <h2
            className="text-[#f5f5f5] mb-4 relative"
            style={{ fontFamily: 'Syne, sans-serif', fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700 }}
          >
            Ready to roll?
          </h2>
          <p className="text-[#888888] mb-8 relative" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '16px' }}>
            Set up in under 5 minutes. Your first location text goes out the same day.
          </p>
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 px-8 py-3.5 text-base font-semibold bg-[#FF6B35] text-[#0a0a0a] rounded-lg hover:bg-[#ff7d4d] transition-all shadow-lg shadow-[#FF6B35]/25 relative"
            style={{ fontFamily: 'DM Sans, sans-serif' }}
          >
            Start Free Trial →
          </Link>
          <p className="mt-4 text-xs text-[#555555] relative" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            No credit card · 14 days free · Cancel anytime
          </p>
        </div>
      </div>
    </section>
  )
}

// ── Footer ────────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-[#2a2a2a] py-10 px-6">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
        {/* Logo + tagline */}
        <div>
          <span style={{ fontFamily: 'Syne, sans-serif' }} className="font-bold text-lg text-[#f5f5f5] tracking-tight">
            rollout<span className="text-[#FF6B35]">.</span>
          </span>
          <p className="text-[#555555] text-xs mt-1" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            Book your spot. Notify your people. Protect your reputation.
          </p>
        </div>

        {/* Links */}
        <div className="flex items-center gap-6">
          <a href="#" className="text-xs text-[#555555] hover:text-[#888888] transition-colors" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            Privacy Policy
          </a>
          <a href="#" className="text-xs text-[#555555] hover:text-[#888888] transition-colors" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            Terms of Service
          </a>
        </div>

        {/* Copyright */}
        <p className="text-xs text-[#555555]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
          © 2025 Rollout. Built for food trucks.
        </p>
      </div>
    </footer>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <Hero />
      <StatsRow />
      <HowItWorks />
      <Features />
      <Pricing />
      <FinalCTA />
      <Footer />
    </div>
  )
}
