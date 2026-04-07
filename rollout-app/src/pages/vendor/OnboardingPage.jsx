import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Upload, X, Clock, ChevronDown } from 'lucide-react'
import QRCode from 'qrcode'
import { jsPDF } from 'jspdf'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50)
}

function detectTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return 'America/Phoenix' }
}

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
]

// ── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ current, total }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full transition-colors ${
              i < current
                ? 'bg-accent'
                : i === current
                ? 'bg-accent'
                : 'bg-border'
            }`}
          />
          {i < total - 1 && (
            <div className={`h-px w-8 transition-colors ${i < current ? 'bg-accent' : 'bg-border'}`} />
          )}
        </div>
      ))}
      <span className="ml-2 text-text-tertiary text-xs font-body">
        Step {current + 1} of {total}
      </span>
    </div>
  )
}

// ── Step 1 — Truck Info ───────────────────────────────────────────────────────

function Step1({ data, onChange }) {
  const fileRef = useRef(null)
  const [preview, setPreview] = useState(data.logoPreview || null)

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) return // 5MB guard
    const url = URL.createObjectURL(file)
    setPreview(url)
    onChange({ logoFile: file, logoPreview: url })
  }

  function removeLogo() {
    setPreview(null)
    onChange({ logoFile: null, logoPreview: null })
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-display font-bold text-3xl text-accent mb-1">
          What's your truck called?
        </h2>
        <p className="text-text-secondary text-sm">Let's get you set up in under 2 minutes.</p>
      </div>

      {/* Truck name */}
      <input
        type="text"
        placeholder="Truck name"
        value={data.name}
        onChange={e => onChange({ name: e.target.value })}
        maxLength={60}
        className="w-full bg-surface-raised border border-border rounded-lg px-3.5 py-2.5 text-text-primary text-sm font-body placeholder-text-tertiary focus:outline-none focus:border-accent transition-colors"
      />

      {/* Logo upload */}
      <div>
        {preview ? (
          <div className="relative w-20 h-20">
            <img src={preview} alt="Logo preview" className="w-20 h-20 rounded-xl object-cover border border-border" />
            <button
              onClick={removeLogo}
              className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-surface-raised border border-border flex items-center justify-center text-text-secondary hover:text-error transition-colors"
            >
              <X size={10} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-20 h-20 rounded-xl border-2 border-dashed border-border hover:border-accent flex flex-col items-center justify-center gap-1.5 text-text-tertiary hover:text-accent transition-colors"
          >
            <Upload size={18} />
            <span className="text-xs font-body">Logo</span>
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        <button
          type="button"
          onClick={() => onChange({ skipLogo: true })}
          className="text-text-tertiary text-xs mt-2 hover:text-text-secondary transition-colors underline underline-offset-2"
        >
          Skip for now
        </button>
      </div>

      {/* Description */}
      <div>
        <input
          type="text"
          placeholder="The best tacos on wheels 🌮"
          value={data.description}
          onChange={e => onChange({ description: e.target.value })}
          maxLength={80}
          className="w-full bg-surface-raised border border-border rounded-lg px-3.5 py-2.5 text-text-primary text-sm font-body placeholder-text-tertiary focus:outline-none focus:border-accent transition-colors"
        />
        <div className="text-text-tertiary text-xs mt-1 text-right">{data.description.length}/80</div>
      </div>
    </div>
  )
}

// ── Step 2 — Google Review Link ───────────────────────────────────────────────

function Step2({ data, onChange }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-display font-bold text-3xl text-accent mb-1">
          Where should happy customers leave reviews?
        </h2>
        <p className="text-text-secondary text-sm">
          We'll send happy customers straight to your review page.
        </p>
      </div>

      <input
        type="url"
        placeholder="https://g.page/..."
        value={data.googleReviewUrl}
        onChange={e => onChange({ googleReviewUrl: e.target.value })}
        className="w-full bg-surface-raised border border-border rounded-lg px-3.5 py-2.5 text-text-primary text-sm font-body placeholder-text-tertiary focus:outline-none focus:border-accent transition-colors"
      />

      <details className="group">
        <summary className="text-text-secondary text-xs cursor-pointer hover:text-text-primary transition-colors list-none flex items-center gap-1">
          <ChevronDown size={12} className="group-open:rotate-180 transition-transform" />
          How do I find this?
        </summary>
        <p className="text-text-tertiary text-xs mt-2 leading-relaxed pl-4">
          Go to your <strong className="text-text-secondary">Google Business Profile</strong> → click{' '}
          <strong className="text-text-secondary">Get more reviews</strong> → copy the link under{' '}
          <strong className="text-text-secondary">Share review form</strong>.
        </p>
      </details>

      <button
        type="button"
        onClick={() => onChange({ skipReview: true })}
        className="text-text-tertiary text-xs hover:text-text-secondary transition-colors underline underline-offset-2 self-start"
      >
        Skip for now
      </button>
    </div>
  )
}

// ── Step 3 — Notification Time ────────────────────────────────────────────────

function Step3({ data, onChange }) {
  const [hour, setHour] = useState(() => {
    const [h] = data.notificationTime.split(':')
    const h24 = parseInt(h)
    return h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24
  })
  const [minute] = useState('00')
  const [ampm, setAmpm] = useState(() => {
    const [h] = data.notificationTime.split(':')
    return parseInt(h) >= 12 ? 'PM' : 'AM'
  })

  function updateTime(newHour, newAmpm) {
    let h = newHour
    if (newAmpm === 'PM' && h !== 12) h = h + 12
    if (newAmpm === 'AM' && h === 12) h = 0
    onChange({ notificationTime: `${String(h).padStart(2, '0')}:00:00` })
  }

  function handleHourChange(e) {
    let val = parseInt(e.target.value)
    if (isNaN(val)) return
    if (val < 1) val = 1
    if (val > 12) val = 12
    setHour(val)
    updateTime(val, ampm)
  }

  function toggleAmpm() {
    const next = ampm === 'AM' ? 'PM' : 'AM'
    setAmpm(next)
    updateTime(hour, next)
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-display font-bold text-3xl text-accent mb-1">
          When should we text your customers?
        </h2>
        <p className="text-text-secondary text-sm">
          We'll notify your subscribers on the morning of each scheduled location.
        </p>
      </div>

      {/* Time picker */}
      <div className="flex items-center gap-3">
        <input
          type="number"
          min={1}
          max={12}
          value={hour}
          onChange={handleHourChange}
          className="w-20 bg-surface-raised border border-border rounded-lg px-3 py-3 text-text-primary text-2xl font-mono text-center focus:outline-none focus:border-accent transition-colors"
        />
        <span className="text-text-secondary text-2xl font-mono">:</span>
        <div className="w-20 bg-surface-raised border border-border rounded-lg px-3 py-3 text-text-secondary text-2xl font-mono text-center">
          00
        </div>
        <button
          type="button"
          onClick={toggleAmpm}
          className="w-20 bg-surface-raised border border-border hover:border-accent rounded-lg px-3 py-3 text-text-primary text-xl font-body font-medium text-center transition-colors"
        >
          {ampm}
        </button>
      </div>

      {/* Timezone */}
      <div>
        <div className="flex items-center gap-1.5 text-text-tertiary text-xs mb-1.5">
          <Clock size={12} />
          <span>Detected: {data.timezone}</span>
          {' · '}
          <button
            type="button"
            onClick={() => onChange({ showTzPicker: !data.showTzPicker })}
            className="underline underline-offset-2 hover:text-text-secondary transition-colors"
          >
            change
          </button>
        </div>
        {data.showTzPicker && (
          <select
            value={data.timezone}
            onChange={e => onChange({ timezone: e.target.value, showTzPicker: false })}
            className="w-full bg-surface-raised border border-border rounded-lg px-3.5 py-2.5 text-text-primary text-sm font-body focus:outline-none focus:border-accent transition-colors"
          >
            {TIMEZONES.map(tz => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  )
}

// ── Step 4 — QR Code ──────────────────────────────────────────────────────────

function Step4({ vendor, appUrl }) {
  const canvasRef = useRef(null)
  const [qrDataUrl, setQrDataUrl] = useState(null)

  const optInUrl = `${appUrl}/join/${vendor?.slug || 'your-truck'}`

  useEffect(() => {
    if (!canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, optInUrl, {
      width: 220,
      margin: 2,
      color: { dark: '#0a0a0a', light: '#ffffff' },
    }).then(() => {
      setQrDataUrl(canvasRef.current.toDataURL('image/png'))
    })
  }, [optInUrl])

  function downloadPng() {
    if (!qrDataUrl) return
    const a = document.createElement('a')
    a.href = qrDataUrl
    a.download = `${vendor?.slug || 'rollout'}-qr.png`
    a.click()
  }

  function downloadPdf() {
    if (!qrDataUrl) return
    const doc = new jsPDF({ unit: 'in', format: [4, 5] })

    // White background
    doc.setFillColor(255, 255, 255)
    doc.rect(0, 0, 4, 5, 'F')

    // QR code centered
    doc.addImage(qrDataUrl, 'PNG', 0.5, 0.4, 3, 3)

    // Truck name
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(10, 10, 10)
    doc.text(vendor?.name || 'My Truck', 2, 3.7, { align: 'center' })

    // Subtext
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(12)
    doc.setTextColor(100, 100, 100)
    doc.text('Scan to follow us & get location updates', 2, 4.15, { align: 'center' })

    doc.save(`${vendor?.slug || 'rollout'}-qr.pdf`)
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-display font-bold text-3xl text-accent mb-1">
          Your QR code is ready
        </h2>
        <p className="text-text-secondary text-sm">
          Put this on your truck window so customers can subscribe.
        </p>
      </div>

      {/* QR code */}
      <div className="flex flex-col items-center gap-4 bg-white rounded-2xl p-6 self-start">
        <canvas ref={canvasRef} className="rounded-lg" />
        <p className="text-[#0a0a0a] text-xs font-body text-center">
          {vendor?.name || 'My Truck'} · Scan to follow us
        </p>
      </div>

      {/* Download buttons */}
      <div className="flex gap-3">
        <button
          onClick={downloadPng}
          disabled={!qrDataUrl}
          className="flex-1 bg-surface-raised border border-border hover:border-accent text-text-primary text-sm font-body font-medium rounded-lg py-2.5 transition-colors disabled:opacity-40"
        >
          Download PNG
        </button>
        <button
          onClick={downloadPdf}
          disabled={!qrDataUrl}
          className="flex-1 bg-surface-raised border border-border hover:border-accent text-text-primary text-sm font-body font-medium rounded-lg py-2.5 transition-colors disabled:opacity-40"
        >
          Download PDF (print‑ready)
        </button>
      </div>
    </div>
  )
}

// ── Step 5 — First Location ───────────────────────────────────────────────────

function Step5({ data, onChange }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-display font-bold text-3xl text-accent mb-1">
          Where's your first stop?
        </h2>
        <p className="text-text-secondary text-sm">
          Add your next location and we'll handle the rest.
        </p>
      </div>

      <input
        type="text"
        placeholder="Enter address..."
        value={data.address}
        onChange={e => onChange({ address: e.target.value })}
        className="w-full bg-surface-raised border border-border rounded-lg px-3.5 py-2.5 text-text-primary text-sm font-body placeholder-text-tertiary focus:outline-none focus:border-accent transition-colors"
      />

      <input
        type="date"
        value={data.date}
        onChange={e => onChange({ date: e.target.value })}
        min={new Date().toISOString().split('T')[0]}
        className="w-full bg-surface-raised border border-border rounded-lg px-3.5 py-2.5 text-text-primary text-sm font-body focus:outline-none focus:border-accent transition-colors"
      />

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-text-tertiary text-xs font-body mb-1 block">Start time</label>
          <input
            type="time"
            value={data.startTime}
            onChange={e => onChange({ startTime: e.target.value })}
            className="w-full bg-surface-raised border border-border rounded-lg px-3.5 py-2.5 text-text-primary text-sm font-body focus:outline-none focus:border-accent transition-colors"
          />
        </div>
        <div className="flex-1">
          <label className="text-text-tertiary text-xs font-body mb-1 block">End time</label>
          <input
            type="time"
            value={data.endTime}
            onChange={e => onChange({ endTime: e.target.value })}
            className="w-full bg-surface-raised border border-border rounded-lg px-3.5 py-2.5 text-text-primary text-sm font-body focus:outline-none focus:border-accent transition-colors"
          />
        </div>
      </div>

      <input
        type="text"
        placeholder="Notes for customers (optional)"
        value={data.notes}
        onChange={e => onChange({ notes: e.target.value })}
        maxLength={140}
        className="w-full bg-surface-raised border border-border rounded-lg px-3.5 py-2.5 text-text-primary text-sm font-body placeholder-text-tertiary focus:outline-none focus:border-accent transition-colors"
      />

      <button
        type="button"
        onClick={() => onChange({ skip: true })}
        className="text-text-tertiary text-xs hover:text-text-secondary transition-colors underline underline-offset-2 self-start"
      >
        I'll add locations later
      </button>
    </div>
  )
}

// ── Main Onboarding Page ──────────────────────────────────────────────────────

const TOTAL_STEPS = 5

export function OnboardingPage() {
  const { user, vendor, refreshVendor } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Form state per step
  const [step1, setStep1] = useState({
    name: vendor?.name || '',
    description: vendor?.description || '',
    logoFile: null,
    logoPreview: vendor?.logo_url || null,
    skipLogo: false,
  })
  const [step2, setStep2] = useState({
    googleReviewUrl: vendor?.google_review_url || '',
    skipReview: false,
  })
  const [step3, setStep3] = useState({
    notificationTime: vendor?.notification_time || '08:00:00',
    timezone: vendor?.timezone || detectTimezone(),
    showTzPicker: false,
  })
  const [step5, setStep5] = useState({
    address: '',
    date: '',
    startTime: '',
    endTime: '',
    notes: '',
    skip: false,
  })

  const appUrl = import.meta.env.VITE_APP_URL || 'http://localhost:5173'

  // ── Save step 1 (truck info + logo) ────────────────────────────────────────
  async function saveStep1() {
    if (!step1.name.trim()) {
      setError('Please enter your truck name')
      return false
    }
    setError('')
    setSaving(true)

    let logoUrl = vendor?.logo_url || null

    // Upload logo if provided
    if (step1.logoFile) {
      const ext = step1.logoFile.name.split('.').pop()
      const path = `${user.id}/logo.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('vendor-logos')
        .upload(path, step1.logoFile, { upsert: true })

      if (uploadError) {
        setSaving(false)
        setError('Logo upload failed — you can add it later in Settings.')
        // Non-fatal — continue without logo
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from('vendor-logos')
          .getPublicUrl(path)
        logoUrl = publicUrl
      }
    }

    const slug = generateSlug(step1.name)

    const { error: dbError } = await supabase
      .from('vendors')
      .update({
        name: step1.name.trim(),
        slug,
        description: step1.description.trim() || null,
        logo_url: logoUrl,
      })
      .eq('user_id', user.id)

    setSaving(false)
    if (dbError) {
      // Slug conflict
      if (dbError.code === '23505') {
        setError('That truck name is already taken — try adding your city (e.g. "Taco Titan Phoenix")')
        return false
      }
      setError('Something went wrong. Please try again.')
      return false
    }

    await refreshVendor()
    return true
  }

  // ── Save step 2 (review link) ───────────────────────────────────────────────
  async function saveStep2() {
    setSaving(true)
    const { error: dbError } = await supabase
      .from('vendors')
      .update({ google_review_url: step2.googleReviewUrl.trim() || null })
      .eq('user_id', user.id)
    setSaving(false)
    if (dbError) { setError('Failed to save. Please try again.'); return false }
    await refreshVendor()
    return true
  }

  // ── Save step 3 (notification time) ────────────────────────────────────────
  async function saveStep3() {
    setSaving(true)
    const { error: dbError } = await supabase
      .from('vendors')
      .update({
        notification_time: step3.notificationTime,
        timezone: step3.timezone,
      })
      .eq('user_id', user.id)
    setSaving(false)
    if (dbError) { setError('Failed to save. Please try again.'); return false }
    await refreshVendor()
    return true
  }

  // ── Save step 5 + finalize onboarding ──────────────────────────────────────
  async function saveStep5AndFinish() {
    setSaving(true)
    setError('')

    // Save first location if not skipped and all required fields present
    if (!step5.skip && step5.address && step5.date && step5.startTime && step5.endTime) {
      const { error: locError } = await supabase
        .from('locations')
        .insert({
          vendor_id: vendor.id,
          address: step5.address.trim(),
          date: step5.date,
          start_time: step5.startTime,
          end_time: step5.endTime,
          notes: step5.notes.trim() || null,
        })
      if (locError) {
        // Non-fatal — vendor can add from Locations page
        console.error('Location save failed:', locError.message)
      }
    }

    // Call edge function — provisions Twilio number + marks onboarding_complete
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/onboarding-complete`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ vendor_id: vendor.id }),
        }
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Setup failed')
    } catch (err) {
      setSaving(false)
      setError(err.message || 'Failed to complete setup. Please try again.')
      return false
    }

    setSaving(false)
    await refreshVendor()
    navigate('/dashboard')
    return true
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  async function handleNext() {
    setError('')
    let ok = true

    if (step === 0) ok = await saveStep1()
    else if (step === 1) ok = await saveStep2()
    else if (step === 2) ok = await saveStep3()
    // step 3 (QR) needs no save
    else if (step === 4) { await saveStep5AndFinish(); return }

    if (ok) setStep(s => s + 1)
  }

  function handleBack() {
    setError('')
    setStep(s => s - 1)
  }

  const isLastStep = step === TOTAL_STEPS - 1

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.replace('/login')
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-4 py-12">
      {/* Logo + sign out */}
      <div className="flex items-center gap-2.5 mb-10">
        <div className="w-8 h-8 rounded-full bg-accent" />
        <span className="font-display font-bold text-xl text-text-primary tracking-tight">Rollout</span>
        <button
          onClick={handleSignOut}
          className="ml-6 text-text-tertiary text-xs hover:text-text-secondary transition-colors underline underline-offset-2"
        >
          Sign out
        </button>
      </div>

      <div className="w-full max-w-sm">
        <StepIndicator current={step} total={TOTAL_STEPS} />

        {/* Step content */}
        <div className="min-h-[340px]">
          {step === 0 && (
            <Step1
              data={step1}
              onChange={patch => setStep1(s => ({ ...s, ...patch }))}
            />
          )}
          {step === 1 && (
            <Step2
              data={step2}
              onChange={patch => setStep2(s => ({ ...s, ...patch }))}
            />
          )}
          {step === 2 && (
            <Step3
              data={step3}
              onChange={patch => setStep3(s => ({ ...s, ...patch }))}
            />
          )}
          {step === 3 && (
            <Step4 vendor={vendor} appUrl={appUrl} />
          )}
          {step === 4 && (
            <Step5
              data={step5}
              onChange={patch => setStep5(s => ({ ...s, ...patch }))}
            />
          )}
        </div>

        {/* Error */}
        {error && (
          <p className="text-accent text-sm mt-3">{error}</p>
        )}

        {/* Nav buttons */}
        <div className="flex items-center gap-3 mt-6">
          {step > 0 && (
            <button
              onClick={handleBack}
              disabled={saving}
              className="px-5 py-2.5 rounded-lg border border-border text-text-secondary text-sm font-body font-medium hover:text-text-primary hover:border-text-secondary transition-colors disabled:opacity-40"
            >
              Back
            </button>
          )}
          <button
            onClick={handleNext}
            disabled={saving || (step === 0 && !step1.name.trim())}
            className="flex-1 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-bg font-body font-medium text-sm rounded-lg py-2.5 flex items-center justify-center gap-2 transition-colors"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            {isLastStep ? 'Go to my dashboard ✦' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
