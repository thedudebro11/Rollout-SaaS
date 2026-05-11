import { useState, useEffect, useRef } from 'react'
import { Loader2, Save, Upload, Check, AlertCircle, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// ── Constants ─────────────────────────────────────────────────────────────────

const TIMEZONES = [
  { value: 'America/New_York',    label: 'Eastern Time (ET)' },
  { value: 'America/Chicago',     label: 'Central Time (CT)' },
  { value: 'America/Denver',      label: 'Mountain Time (MT)' },
  { value: 'America/Phoenix',     label: 'Arizona (no DST)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage',   label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu',    label: 'Hawaii Time (HT)' },
]

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, description, children }) {
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="font-display font-bold text-base text-text-primary">{title}</h2>
        {description && (
          <p className="text-text-secondary font-body text-xs mt-0.5">{description}</p>
        )}
      </div>
      <div className="px-6 py-5 flex flex-col gap-5">
        {children}
      </div>
    </div>
  )
}

// ── Field ─────────────────────────────────────────────────────────────────────

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-text-secondary font-body text-sm font-medium mb-1.5">
        {label}
        {hint && <span className="text-text-tertiary font-normal ml-1">({hint})</span>}
      </label>
      {children}
    </div>
  )
}

const inputClass = "w-full bg-surface-raised border border-border rounded-lg px-3 py-2.5 text-text-primary font-body text-sm placeholder-text-tertiary focus:outline-none focus:border-accent transition-colors"

function toE164(raw) {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`
  return ''
}

function formatPhoneDisplay(e164) {
  if (!e164) return ''
  const digits = e164.replace(/\D/g, '')
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return e164
}

// ── Save Button ───────────────────────────────────────────────────────────────

function SaveButton({ saving, saved }) {
  return (
    <div className="flex justify-end pt-2">
      <button
        type="submit"
        disabled={saving}
        className="flex items-center gap-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-body font-medium text-sm rounded-lg px-5 py-2.5 transition-colors"
      >
        {saving ? (
          <><Loader2 size={14} className="animate-spin" /> Saving…</>
        ) : saved ? (
          <><Check size={14} /> Saved</>
        ) : (
          <><Save size={14} /> Save changes</>
        )}
      </button>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { vendor, refreshVendor } = useAuth()
  const fileInputRef = useRef(null)

  const [loading, setLoading] = useState(true)

  // Truck info
  const [name,        setName]        = useState('')
  const [description, setDescription] = useState('')
  const [logoUrl,     setLogoUrl]     = useState('')
  const [logoFile,    setLogoFile]    = useState(null)
  const [logoPreview, setLogoPreview] = useState('')
  const [logoError,   setLogoError]   = useState('')
  const [savingTruck, setSavingTruck] = useState(false)
  const [savedTruck,  setSavedTruck]  = useState(false)

  // Notifications
  const [notifTime,       setNotifTime]       = useState('08:00')
  const [timezone,        setTimezone]        = useState('America/Phoenix')
  const [sentimentDelay,  setSentimentDelay]  = useState(2)
  const [savingNotif,     setSavingNotif]     = useState(false)
  const [savedNotif,      setSavedNotif]      = useState(false)

  // Reviews
  const [reviewUrl,    setReviewUrl]    = useState('')
  const [savingReview, setSavingReview] = useState(false)
  const [savedReview,  setSavedReview]  = useState(false)

  // SMS Commands
  const [operatorPhone,    setOperatorPhone]    = useState('')
  const [truckPhone,       setTruckPhone]       = useState('')
  const [savingPhone,      setSavingPhone]      = useState(false)
  const [savedPhone,       setSavedPhone]       = useState(false)

  // Copy schedule link
  const [copied, setCopied] = useState(false)

  // Save error (shared across sections)
  const [saveError, setSaveError] = useState('')

  // Change password
  const [currentPassword,  setCurrentPassword]  = useState('')
  const [newPassword,      setNewPassword]      = useState('')
  const [confirmPassword,  setConfirmPassword]  = useState('')
  const [savingPassword,   setSavingPassword]   = useState(false)
  const [passwordMsg,      setPasswordMsg]      = useState({ type: '', text: '' })

  // Danger zone / delete account
  const [showDeleteModal,  setShowDeleteModal]  = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting,          setDeleting]         = useState(false)
  const [deleteError,       setDeleteError]       = useState('')

  useEffect(() => {
    if (vendor) loadVendor()
  }, [vendor])

  async function loadVendor() {
    setLoading(true)
    const { data } = await supabase
      .from('vendors')
      .select('name, description, logo_url, notification_time, timezone, sentiment_delay_hours, google_review_url, operator_phone_number, twilio_phone_number')
      .eq('id', vendor.id)
      .single()

    if (data) {
      setName(data.name ?? '')
      setDescription(data.description ?? '')
      setLogoUrl(data.logo_url ?? '')
      setLogoPreview(data.logo_url ?? '')
      setNotifTime(data.notification_time?.slice(0, 5) ?? '08:00')
      setTimezone(data.timezone ?? 'America/Phoenix')
      setSentimentDelay(data.sentiment_delay_hours ?? 2)
      setReviewUrl(data.google_review_url ?? '')
      setTruckPhone(data.twilio_phone_number ?? '')
      setOperatorPhone(formatPhoneDisplay(data.operator_phone_number ?? ''))
    }
    setLoading(false)
  }

  function handleLogoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  async function saveTruckInfo(e) {
    e.preventDefault()
    setSavingTruck(true)
    setSavedTruck(false)
    setLogoError('')
    setSaveError('')

    let uploadedUrl = logoUrl

    if (logoFile) {
      const ext  = logoFile.name.split('.').pop()
      // Unique filename avoids needing UPDATE/DELETE storage policies
      const path = `${vendor.user_id}/logo-${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('vendor-logos')
        .upload(path, logoFile)

      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('vendor-logos').getPublicUrl(path)
        uploadedUrl = urlData.publicUrl
      } else {
        setLogoError('Logo upload failed — check that the file is under 2MB.')
        console.error('Logo upload failed:', uploadErr.message)
      }
    }

    const { error: dbErr } = await supabase.from('vendors').update({
      name:        name.trim(),
      description: description.trim() || null,
      logo_url:    uploadedUrl || null,
    }).eq('id', vendor.id)

    if (dbErr) {
      setSaveError('Failed to save. Please try again.')
      setSavingTruck(false)
      return
    }

    setLogoUrl(uploadedUrl)
    setLogoFile(null)
    setSavingTruck(false)
    setSavedTruck(true)
    await refreshVendor()
    setTimeout(() => setSavedTruck(false), 3000)
  }

  async function saveNotifications(e) {
    e.preventDefault()
    setSavingNotif(true)
    setSavedNotif(false)
    setSaveError('')

    const { error } = await supabase.from('vendors').update({
      notification_time:    `${notifTime}:00`,
      timezone,
      sentiment_delay_hours: Number(sentimentDelay),
    }).eq('id', vendor.id)

    if (error) {
      setSaveError('Failed to save. Please try again.')
      setSavingNotif(false)
      return
    }

    setSavingNotif(false)
    setSavedNotif(true)
    setTimeout(() => setSavedNotif(false), 3000)
  }

  async function saveReviews(e) {
    e.preventDefault()
    setSavingReview(true)
    setSavedReview(false)
    setSaveError('')

    const { error } = await supabase.from('vendors').update({
      google_review_url: reviewUrl.trim() || null,
    }).eq('id', vendor.id)

    if (error) {
      setSaveError('Failed to save. Please try again.')
      setSavingReview(false)
      return
    }

    setSavingReview(false)
    setSavedReview(true)
    setTimeout(() => setSavedReview(false), 3000)
  }

  async function savePhone(e) {
    e.preventDefault()
    const e164 = toE164(operatorPhone)
    if (operatorPhone.trim() && !e164) return
    setSavingPhone(true)
    setSavedPhone(false)
    setSaveError('')

    const { error } = await supabase.from('vendors').update({
      operator_phone_number: e164 || null,
    }).eq('id', vendor.id)

    if (error) {
      setSaveError('Failed to save. Please try again.')
      setSavingPhone(false)
      return
    }

    setSavingPhone(false)
    setSavedPhone(true)
    setTimeout(() => setSavedPhone(false), 3000)
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    setPasswordMsg({ type: '', text: '' })

    if (newPassword.length < 8) {
      setPasswordMsg({ type: 'error', text: 'New password must be at least 8 characters.' })
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'Passwords do not match.' })
      return
    }

    setSavingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSavingPassword(false)

    if (error) {
      setPasswordMsg({ type: 'error', text: error.message || 'Failed to update password.' })
      return
    }

    setPasswordMsg({ type: 'success', text: 'Password updated successfully.' })
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText !== 'DELETE') return
    setDeleting(true)
    setDeleteError('')

    const { error: vendorErr } = await supabase
      .from('vendors')
      .delete()
      .eq('id', vendor.id)

    if (vendorErr) {
      setDeleteError('Failed to delete account. Please contact support.')
      setDeleting(false)
      return
    }

    await supabase.auth.signOut({ scope: 'local' })
    window.location.replace('/')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-text-tertiary" />
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto">

      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display font-bold text-2xl text-text-primary">Settings</h1>
        <p className="text-text-secondary font-body text-sm mt-0.5">
          Manage your truck profile and preferences.
        </p>
      </div>

      {saveError && (
        <div className="flex items-center gap-2 bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-3 mb-2 text-red-400 font-body text-sm">
          <AlertCircle size={14} className="flex-shrink-0" />
          {saveError}
        </div>
      )}

      <div className="flex flex-col gap-6">

        {/* ── Truck Info ──────────────────────────────────────────────────────── */}
        <Section title="Truck Info" description="Shown on your public opt-in page.">
          <form onSubmit={saveTruckInfo} className="flex flex-col gap-5">

            {/* Logo */}
            <Field label="Logo">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-surface-raised border border-border overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {logoPreview
                    ? <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
                    : <span className="text-text-tertiary font-body text-xs">No logo</span>
                  }
                </div>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleLogoChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 text-sm font-body font-medium text-text-secondary hover:text-text-primary border border-border hover:border-text-secondary px-3 py-2 rounded-lg transition-colors"
                  >
                    <Upload size={14} />
                    {logoPreview ? 'Change logo' : 'Upload logo'}
                  </button>
                  <p className="text-text-tertiary font-body text-xs mt-1.5">JPEG, PNG or WEBP, under 2MB</p>
                </div>
              </div>
            </Field>

            {/* Name */}
            <Field label="Truck name">
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Taco El Rey"
                required
                className={inputClass}
              />
            </Field>

            {/* Description */}
            <Field label="Description" hint="optional">
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Authentic street tacos, handmade tortillas, family recipes since 1987."
                rows={3}
                className={inputClass + ' resize-none'}
              />
            </Field>

            {/* Schedule link */}
            {vendor?.slug && (
              <Field label="Public schedule link">
                <div className="flex items-center gap-2 p-3 rounded-lg bg-[#141414] border border-[#2a2a2a]">
                  <span className="text-[#888888] text-sm font-mono flex-1 truncate">
                    {window.location.origin}/{vendor.slug}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/${vendor.slug}`)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    }}
                    className="text-[#FF6B35] text-sm font-medium whitespace-nowrap"
                  >
                    {copied ? 'Copied!' : 'Copy link'}
                  </button>
                </div>
              </Field>
            )}

            {logoError && (
              <div className="flex items-center gap-2 text-red-500 font-body text-sm">
                <AlertCircle size={14} />
                {logoError}
              </div>
            )}
            <SaveButton saving={savingTruck} saved={savedTruck} />
          </form>
        </Section>

        {/* ── Notifications ───────────────────────────────────────────────────── */}
        <Section
          title="Notifications"
          description="Control when your morning SMS goes out each day."
        >
          <form onSubmit={saveNotifications} className="flex flex-col gap-5">

            {/* Notification time */}
            <Field label="Daily SMS time" hint="when subscribers get their morning update">
              <input
                type="time"
                value={notifTime}
                onChange={e => setNotifTime(e.target.value)}
                className={inputClass}
              />
            </Field>

            {/* Timezone */}
            <Field label="Timezone">
              <select
                value={timezone}
                onChange={e => setTimezone(e.target.value)}
                className={inputClass}
              >
                {TIMEZONES.map(tz => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
            </Field>

            {/* Sentiment delay */}
            <Field label="Sentiment ask delay" hint="hours after your location ends">
              <select
                value={sentimentDelay}
                onChange={e => setSentimentDelay(e.target.value)}
                className={inputClass}
              >
                {[0, 1, 2, 3, 4, 6].map(h => (
                  <option key={h} value={h}>
                    {h === 0 ? 'Immediately' : `${h} hour${h !== 1 ? 's' : ''} after`}
                  </option>
                ))}
              </select>
              <p className="text-text-tertiary font-body text-xs mt-1.5">
                How long after your truck closes before we ask customers how their visit was.
              </p>
            </Field>

            <SaveButton saving={savingNotif} saved={savedNotif} />
          </form>
        </Section>

        {/* ── Reviews ─────────────────────────────────────────────────────────── */}
        <Section
          title="Google Reviews"
          description="Sent to happy customers after a positive sentiment response."
        >
          <form onSubmit={saveReviews} className="flex flex-col gap-5">
            <Field label="Google review URL" hint="optional">
              <input
                type="url"
                value={reviewUrl}
                onChange={e => setReviewUrl(e.target.value)}
                placeholder="https://g.page/r/your-review-link"
                className={inputClass}
              />
              <p className="text-text-tertiary font-body text-xs mt-1.5">
                Find this in your Google Business Profile → Ask for reviews → Share review form.
              </p>
            </Field>

            <SaveButton saving={savingReview} saved={savedReview} />
          </form>
        </Section>

        {/* ── SMS Commands ─────────────────────────────────────────────────────── */}
        <Section
          title="SMS Commands"
          description="Text your truck number to add locations — no webapp needed."
        >
          <form onSubmit={savePhone} className="flex flex-col gap-5">

            {/* How it works callout */}
            <div className="bg-accent-muted border border-accent/20 rounded-lg px-4 py-3 flex flex-col gap-1">
              <p className="text-text-primary font-body text-sm font-medium">How it works</p>
              <p className="text-text-secondary font-body text-xs leading-relaxed">
                Text your truck's number from your mobile and Rollout adds the location automatically.
                No login, no form — just a quick text from the parking lot.
              </p>
              <div className="mt-2 font-mono text-xs text-text-secondary space-y-0.5">
                <p><span className="text-accent font-medium">Add location:</span> Downtown Plaza 11am-2pm</p>
                <p><span className="text-accent font-medium">Multiple stops:</span> send a second text</p>
                <p><span className="text-accent font-medium">Check today:</span> STATUS</p>
                <p><span className="text-accent font-medium">All commands:</span> HELP</p>
              </div>
            </div>

            {/* Truck phone (read-only) */}
            {truckPhone && (
              <Field label="Your truck's number" hint="text this number">
                <input
                  type="text"
                  value={formatPhoneDisplay(truckPhone)}
                  readOnly
                  className={inputClass + ' opacity-60 cursor-default select-all'}
                />
              </Field>
            )}

            {/* Operator mobile */}
            <Field label="Your mobile number" hint="the phone you'll text from">
              <input
                type="tel"
                value={operatorPhone}
                onChange={e => setOperatorPhone(e.target.value)}
                placeholder="(555) 123-4567"
                className={inputClass}
              />
              <p className="text-text-tertiary font-body text-xs mt-1.5">
                Only texts from this number are treated as operator commands. Customers are unaffected.
              </p>
            </Field>

            <SaveButton saving={savingPhone} saved={savedPhone} />
          </form>
        </Section>

        {/* ── Security ────────────────────────────────────────────────────────── */}
        <Section title="Security" description="Update your account password.">
          <form onSubmit={handleChangePassword} className="flex flex-col gap-5">

            <Field label="New password">
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className={inputClass}
              />
            </Field>

            <Field label="Confirm new password">
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className={inputClass}
              />
            </Field>

            {passwordMsg.text && (
              <div className={`flex items-center gap-2 font-body text-sm ${
                passwordMsg.type === 'success' ? 'text-green-400' : 'text-red-400'
              }`}>
                <AlertCircle size={14} className="flex-shrink-0" />
                {passwordMsg.text}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingPassword}
                className="flex items-center gap-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-[#0a0a0a] font-body font-medium text-sm rounded-lg px-5 py-2.5 transition-colors"
              >
                {savingPassword ? (
                  <><Loader2 size={14} className="animate-spin" /> Updating…</>
                ) : (
                  'Update Password'
                )}
              </button>
            </div>
          </form>
        </Section>

        {/* ── Danger Zone ─────────────────────────────────────────────────────── */}
        <div className="bg-surface border border-red-900 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-red-900/50">
            <h2 className="font-display font-bold text-base text-red-500">Danger Zone</h2>
            <p className="text-text-secondary font-body text-xs mt-0.5">
              These actions are permanent and cannot be undone.
            </p>
          </div>
          <div className="px-6 py-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-text-primary font-body text-sm font-medium">Delete account</p>
              <p className="text-text-tertiary font-body text-xs mt-0.5">
                Permanently deletes your account, truck profile, and all data.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setShowDeleteModal(true); setDeleteConfirmText(''); setDeleteError('') }}
              className="flex-shrink-0 px-4 py-2 rounded-lg border border-red-700 text-red-400 hover:bg-red-900/20 font-body font-medium text-sm transition-colors"
            >
              Delete Account
            </button>
          </div>
        </div>

      </div>

      {/* ── Delete confirmation modal ──────────────────────────────────────────── */}
      {showDeleteModal && (
        <>
          <div className="fixed inset-0 bg-black/70 z-40" onClick={() => setShowDeleteModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="bg-surface border border-red-900 rounded-2xl w-full max-w-sm p-6 flex flex-col gap-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display font-bold text-lg text-red-500">Delete Account</h3>
                  <p className="text-text-secondary font-body text-sm mt-1">
                    This will permanently delete your truck profile, all locations, subscribers, and messages.
                    This action cannot be undone.
                  </p>
                </div>
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="text-text-tertiary hover:text-text-primary transition-colors flex-shrink-0"
                >
                  <X size={18} />
                </button>
              </div>

              <div>
                <label className="block text-text-secondary font-body text-sm font-medium mb-1.5">
                  Type <span className="text-red-400 font-mono font-bold">DELETE</span> to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={e => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className={inputClass}
                />
              </div>

              {deleteError && (
                <div className="flex items-center gap-2 text-red-400 font-body text-sm">
                  <AlertCircle size={14} className="flex-shrink-0" />
                  {deleteError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-border text-text-secondary font-body text-sm font-medium hover:text-text-primary hover:border-text-secondary transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmText !== 'DELETE' || deleting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-body font-medium text-sm transition-colors"
                >
                  {deleting && <Loader2 size={14} className="animate-spin" />}
                  Delete forever
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
