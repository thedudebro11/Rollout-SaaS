import { useState, useEffect } from 'react'
import { Plus, MapPin, Clock, Edit2, Trash2, RefreshCw, Loader2, X, Calendar } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayISO() {
  const d = new Date()
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

function formatTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`
}

function formatDateLabel(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const dt  = new Date(y, mo - 1, d)
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const tom = new Date(now); tom.setDate(now.getDate() + 1)
  if (dt.getTime() === now.getTime()) return 'Today'
  if (dt.getTime() === tom.getTime()) return 'Tomorrow'
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

const EMPTY_FORM = {
  date:         todayISO(),
  address:      '',
  start_time:   '11:00',
  end_time:     '14:00',
  notes:        '',
  is_recurring: false,
}

// ── Location Card ─────────────────────────────────────────────────────────────

function LocationCard({ loc, onEdit, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="bg-surface-raised border border-border rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Address */}
          <div className="flex items-start gap-2 mb-1.5">
            <MapPin size={14} className="text-accent mt-0.5 flex-shrink-0" />
            <p className="text-text-primary font-body text-sm font-medium leading-snug">
              {loc.address}
            </p>
          </div>

          {/* Time */}
          <div className="flex items-center gap-2 pl-5 mb-1">
            <Clock size={13} className="text-text-tertiary flex-shrink-0" />
            <span className="text-text-secondary font-body text-xs">
              {formatTime(loc.start_time)} – {formatTime(loc.end_time)}
            </span>
          </div>

          {/* Notes */}
          {loc.notes && (
            <p className="text-text-tertiary font-body text-xs mt-1 pl-5 italic leading-relaxed">
              {loc.notes}
            </p>
          )}

          {/* Badges */}
          <div className="flex items-center gap-2 mt-2.5 pl-5">
            {loc.is_recurring && (
              <span className="inline-flex items-center gap-1 text-[10px] font-body font-medium text-accent bg-accent-muted px-2 py-0.5 rounded-full">
                <RefreshCw size={9} /> Weekly
              </span>
            )}
            {loc.morning_sms_sent && (
              <span className="text-[10px] font-body font-medium text-success bg-success-muted px-2 py-0.5 rounded-full">
                SMS sent
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onEdit(loc)}
            className="p-2 text-text-tertiary hover:text-text-primary hover:bg-surface transition-colors rounded-lg"
            title="Edit location"
          >
            <Edit2 size={15} />
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-2 text-text-tertiary hover:text-error hover:bg-error-muted transition-colors rounded-lg"
            title="Delete location"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Inline delete confirmation */}
      {confirmDelete && (
        <div className="mt-3 pt-3 border-t border-border">
          {loc.morning_sms_sent && (
            <p className="text-warning text-xs font-body mb-2 leading-relaxed">
              The morning SMS for this location has already been sent — subscribers have already been notified.
            </p>
          )}
          <div className="flex items-center gap-3">
            <span className="text-text-secondary text-xs font-body">Delete this location?</span>
            <button
              onClick={() => onDelete(loc.id)}
              className="text-xs font-body font-semibold text-error hover:text-red-400 transition-colors"
            >
              Yes, delete
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs font-body text-text-tertiary hover:text-text-secondary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Add / Edit Sheet ──────────────────────────────────────────────────────────

function LocationSheet({ mode, initial, onSave, onClose, saving }) {
  const [form, setForm]   = useState(initial)
  const [error, setError] = useState('')

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }))
    setError('')
  }

  function validate() {
    if (!form.date)               return 'Date is required'
    if (!form.address.trim())     return 'Address is required'
    if (!form.start_time)         return 'Start time is required'
    if (!form.end_time)           return 'End time is required'
    if (form.start_time >= form.end_time) return 'End time must be after start time'
    return null
  }

  function handleSubmit(e) {
    e.preventDefault()
    const err = validate()
    if (err) { setError(err); return }
    onSave(form)
  }

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-surface border-l border-border z-50 flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border flex-shrink-0">
          <h2 className="font-display font-bold text-lg text-text-primary">
            {mode === 'add' ? 'Add Location' : 'Edit Location'}
          </h2>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors p-1 rounded-lg hover:bg-surface-raised"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable form body + footer as one <form> */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">

            {/* Date */}
            <div>
              <label className="block text-text-secondary text-sm font-body font-medium mb-1.5">
                Date
              </label>
              <input
                type="date"
                value={form.date}
                min={todayISO()}
                onChange={e => set('date', e.target.value)}
                className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2.5 text-text-primary font-body text-sm focus:outline-none focus:border-accent transition-colors"
              />
            </div>

            {/* Address */}
            <div>
              <label className="block text-text-secondary text-sm font-body font-medium mb-1.5">
                Address
              </label>
              <input
                type="text"
                value={form.address}
                onChange={e => set('address', e.target.value)}
                placeholder="123 Main St, Phoenix, AZ 85001"
                autoComplete="off"
                className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2.5 text-text-primary font-body text-sm placeholder-text-tertiary focus:outline-none focus:border-accent transition-colors"
              />
            </div>

            {/* Start / End time */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-text-secondary text-sm font-body font-medium mb-1.5">
                  Start time
                </label>
                <input
                  type="time"
                  value={form.start_time}
                  onChange={e => set('start_time', e.target.value)}
                  className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2.5 text-text-primary font-body text-sm focus:outline-none focus:border-accent transition-colors"
                />
              </div>
              <div>
                <label className="block text-text-secondary text-sm font-body font-medium mb-1.5">
                  End time
                </label>
                <input
                  type="time"
                  value={form.end_time}
                  onChange={e => set('end_time', e.target.value)}
                  className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2.5 text-text-primary font-body text-sm focus:outline-none focus:border-accent transition-colors"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-text-secondary text-sm font-body font-medium mb-1.5">
                Notes{' '}
                <span className="text-text-tertiary font-normal">(optional — included in SMS)</span>
              </label>
              <textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder="Behind the library, cash and card accepted"
                rows={3}
                className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2.5 text-text-primary font-body text-sm placeholder-text-tertiary focus:outline-none focus:border-accent transition-colors resize-none"
              />
            </div>

            {/* Recurring toggle */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div className="relative flex-shrink-0">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={form.is_recurring}
                  onChange={e => set('is_recurring', e.target.checked)}
                />
                <div className="w-9 h-5 bg-border peer-checked:bg-accent rounded-full transition-colors" />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform peer-checked:translate-x-4" />
              </div>
              <div>
                <p className="text-text-primary font-body text-sm font-medium">Repeat weekly</p>
                <p className="text-text-tertiary font-body text-xs mt-0.5">
                  Same spot every week on this day
                </p>
              </div>
            </label>

            {error && (
              <p className="text-error text-sm font-body">{error}</p>
            )}
          </div>

          {/* Footer — inside <form> so Enter submits */}
          <div className="px-6 py-4 border-t border-border flex-shrink-0">
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-body font-medium text-sm rounded-lg py-3 flex items-center justify-center gap-2 transition-colors"
            >
              {saving && <Loader2 size={15} className="animate-spin" />}
              {mode === 'add' ? 'Save Location' : 'Update Location'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function LocationsPage() {
  const { vendor } = useAuth()

  const [locations, setLocations]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [showPast, setShowPast]     = useState(false)
  const [showSheet, setShowSheet]   = useState(null)   // 'add' | 'edit'
  const [editingLoc, setEditingLoc] = useState(null)
  const [saving, setSaving]         = useState(false)

  useEffect(() => {
    if (vendor) loadLocations()
  }, [vendor, showPast])

  async function loadLocations() {
    setLoading(true)
    const today = todayISO()

    let q = supabase
      .from('locations')
      .select('*')
      .eq('vendor_id', vendor.id)
      .order('date',       { ascending: !showPast })
      .order('start_time', { ascending: true })

    q = showPast ? q.lt('date', today) : q.gte('date', today)

    const { data } = await q
    setLocations(data || [])
    setLoading(false)
  }

  async function handleSave(form) {
    setSaving(true)

    const payload = {
      vendor_id:       vendor.id,
      address:         form.address.trim(),
      date:            form.date,
      start_time:      form.start_time,
      end_time:        form.end_time,
      notes:           form.notes.trim() || null,
      is_recurring:    form.is_recurring,
      recurrence_rule: form.is_recurring ? 'FREQ=WEEKLY' : null,
    }

    if (showSheet === 'add') {
      const { error } = await supabase.from('locations').insert(payload)
      setSaving(false)
      if (!error) { setShowSheet(null); loadLocations() }
    } else {
      const { error } = await supabase
        .from('locations')
        .update(payload)
        .eq('id', editingLoc.id)
      setSaving(false)
      if (!error) { setShowSheet(null); loadLocations() }
    }
  }

  async function handleDelete(id) {
    await supabase.from('locations').delete().eq('id', id)
    setLocations(prev => prev.filter(l => l.id !== id))
  }

  function openAdd() {
    setEditingLoc(null)
    setShowSheet('add')
  }

  function openEdit(loc) {
    setEditingLoc(loc)
    setShowSheet('edit')
  }

  // Group by date
  const grouped = locations.reduce((acc, loc) => {
    ;(acc[loc.date] ??= []).push(loc)
    return acc
  }, {})
  const dates = Object.keys(grouped).sort((a, b) =>
    showPast ? b.localeCompare(a) : a.localeCompare(b)
  )

  const sheetInitial = (showSheet === 'edit' && editingLoc)
    ? {
        date:         editingLoc.date,
        address:      editingLoc.address,
        start_time:   editingLoc.start_time?.slice(0, 5) ?? '',
        end_time:     editingLoc.end_time?.slice(0, 5)   ?? '',
        notes:        editingLoc.notes ?? '',
        is_recurring: editingLoc.is_recurring ?? false,
      }
    : EMPTY_FORM

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto">

      {/* Page header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl text-text-primary">Locations</h1>
          <p className="text-text-secondary font-body text-sm mt-0.5">
            Schedule where your truck will be
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white font-body font-medium text-sm rounded-lg px-4 py-2.5 transition-colors flex-shrink-0"
        >
          <Plus size={16} />
          Add Location
        </button>
      </div>

      {/* Upcoming / Past toggle */}
      <div className="flex items-center gap-1 mb-6">
        {['Upcoming', 'Past'].map((label, i) => {
          const isPast = i === 1
          const active = showPast === isPast
          return (
            <button
              key={label}
              onClick={() => setShowPast(isPast)}
              className={`text-sm font-body font-medium px-3 py-1.5 rounded-lg transition-colors ${
                active
                  ? 'bg-accent-muted text-accent'
                  : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-raised'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-text-tertiary" />
        </div>
      ) : dates.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-14 h-14 rounded-full bg-surface-raised flex items-center justify-center mx-auto mb-4">
            <Calendar size={22} className="text-text-tertiary" />
          </div>
          <p className="font-display font-bold text-text-primary text-lg mb-1">
            {showPast ? 'No past locations' : 'No upcoming locations'}
          </p>
          <p className="text-text-secondary font-body text-sm mb-6 max-w-xs mx-auto">
            {showPast
              ? "Locations you've completed will appear here."
              : 'Add your first stop and let customers know where to find you.'}
          </p>
          {!showPast && (
            <button
              onClick={openAdd}
              className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-white font-body font-medium text-sm rounded-lg px-4 py-2.5 transition-colors"
            >
              <Plus size={16} />
              Add Location
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-7">
          {dates.map(date => (
            <div key={date}>
              <p className="text-text-tertiary font-body text-xs font-semibold uppercase tracking-wider mb-3">
                {formatDateLabel(date)}
              </p>
              <div className="flex flex-col gap-2">
                {grouped[date].map(loc => (
                  <LocationCard
                    key={loc.id}
                    loc={loc}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Slide-in sheet */}
      {showSheet && (
        <LocationSheet
          mode={showSheet}
          initial={sheetInitial}
          onSave={handleSave}
          onClose={() => setShowSheet(null)}
          saving={saving}
        />
      )}
    </div>
  )
}
