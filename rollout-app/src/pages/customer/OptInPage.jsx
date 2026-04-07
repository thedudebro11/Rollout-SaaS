import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'

// ── Phone helpers ─────────────────────────────────────────────────────────────

function formatPhoneDisplay(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

function toE164(raw) {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`
  return null
}

function isValidUS(raw) {
  return toE164(raw) !== null
}

// ── Vendor logo / avatar ──────────────────────────────────────────────────────

function VendorAvatar({ vendor }) {
  if (vendor.logo_url) {
    return (
      <img
        src={vendor.logo_url}
        alt={vendor.name}
        className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-md"
      />
    )
  }
  // Fallback: initials on accent background
  const initials = vendor.name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()
  return (
    <div className="w-24 h-24 rounded-full bg-accent flex items-center justify-center border-4 border-white shadow-md">
      <span className="text-white font-display font-bold text-2xl">{initials}</span>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function OptInPage() {
  const { slug } = useParams()

  const [vendor, setVendor]       = useState(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [notFound, setNotFound]   = useState(false)

  const [phone, setPhone]         = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState('')
  const [result, setResult]       = useState(null) // 'new' | 'existing'

  // Load vendor by slug
  useEffect(() => {
    async function loadVendor() {
      const { data, error } = await supabase
        .from('vendors')
        .select('id, name, slug, logo_url, description')
        .eq('slug', slug)
        .eq('onboarding_complete', true)
        .single()

      setPageLoading(false)
      if (error || !data) { setNotFound(true); return }
      setVendor(data)
    }
    loadVendor()
  }, [slug])

  function handlePhoneChange(e) {
    const formatted = formatPhoneDisplay(e.target.value)
    setPhone(formatted)
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!isValidUS(phone)) {
      setError('Please enter a valid US phone number')
      return
    }

    setSubmitting(true)
    const e164 = toE164(phone)

    const { data, error: fnError } = await supabase.functions.invoke('subscriber-optin', {
      body: { vendor_slug: slug, phone_number: e164 },
    })

    setSubmitting(false)

    if (fnError) {
      let body = null
      try { body = await fnError.context?.json() } catch (_) {}
      setError(body?.error || 'Something went wrong, please try again')
      return
    }

    setResult(data?.already_subscribed ? 'existing' : 'new')
  }

  // ── Loading state ─────────────────────────────────────────────────────────

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-[#fafaf8] flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-[#999]" />
      </div>
    )
  }

  // ── 404 state ─────────────────────────────────────────────────────────────

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#fafaf8] flex flex-col items-center justify-center px-6 text-center">
        <p className="text-[#1a1a1a] font-display font-bold text-2xl mb-2">Truck not found</p>
        <p className="text-[#666] text-sm">This link may be incorrect or the truck may have moved on.</p>
      </div>
    )
  }

  // ── Success state ─────────────────────────────────────────────────────────

  if (result) {
    return (
      <div className="min-h-screen bg-[#fafaf8] flex flex-col items-center justify-center px-6 text-center">
        <div className="mb-6">
          <VendorAvatar vendor={vendor} />
        </div>
        <p className="text-4xl mb-4">{result === 'new' ? '🌮' : '👋'}</p>
        <h1 className="font-display font-bold text-2xl text-[#1a1a1a] mb-2">
          {result === 'new'
            ? "You're in!"
            : "You're already on our list!"}
        </h1>
        <p className="text-[#666] text-sm leading-relaxed max-w-xs">
          {result === 'new'
            ? `Watch for a text from us. We'll let you know every time ${vendor.name} is rolling out.`
            : `We'll see you soon 🙌`}
        </p>
      </div>
    )
  }

  // ── Form state ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#fafaf8] flex flex-col items-center justify-start px-6 pt-16 pb-12">
      {/* Vendor branding */}
      <div className="flex flex-col items-center gap-3 mb-8">
        <VendorAvatar vendor={vendor} />
        <div className="text-center">
          <h1 className="font-display font-bold text-2xl text-[#1a1a1a] leading-tight">
            {vendor.name}
          </h1>
          {vendor.description && (
            <p className="text-[#666] text-sm mt-1">{vendor.description}</p>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="w-full max-w-sm h-px bg-[#e5e5e3] mb-8" />

      {/* Form */}
      <div className="w-full max-w-sm">
        <h2 className="font-display font-bold text-xl text-[#1a1a1a] text-center mb-5">
          Get notified where we are
        </h2>

        {error && (
          <p className="text-red-500 text-sm text-center mb-4">{error}</p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="tel"
            inputMode="numeric"
            placeholder="(520) 555-0000"
            value={phone}
            onChange={handlePhoneChange}
            className="w-full border border-[#e5e5e3] rounded-xl px-4 py-3.5 text-[#1a1a1a] text-base font-body placeholder-[#bbb] focus:outline-none focus:border-[#1a1a1a] bg-white transition-colors"
            autoComplete="tel"
          />

          <button
            type="submit"
            disabled={submitting || phone.replace(/\D/g, '').length < 10}
            className="w-full bg-[#1a1a1a] hover:bg-[#333] disabled:opacity-40 disabled:cursor-not-allowed text-white font-body font-medium text-base rounded-xl py-3.5 flex items-center justify-center gap-2 transition-colors"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            Text Me Locations 🌮
          </button>
        </form>

        <p className="text-[#aaa] text-xs text-center mt-5 leading-relaxed">
          By subscribing you agree to receive SMS from {vendor.name}.
          Reply STOP to unsubscribe. Msg &amp; data rates may apply.
        </p>
      </div>
    </div>
  )
}
