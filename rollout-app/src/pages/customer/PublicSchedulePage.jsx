import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { MapPin, Clock, Calendar, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'

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
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

// ── Vendor avatar (shared pattern with OptInPage) ────────────────────────────

function VendorAvatar({ vendor }) {
  if (vendor.logo_url) {
    return (
      <img
        src={vendor.logo_url}
        alt={vendor.name}
        className="w-20 h-20 rounded-full object-cover border-4 border-white shadow-sm"
      />
    )
  }
  const initials = vendor.name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()
  return (
    <div className="w-20 h-20 rounded-full bg-[#1a1a1a] flex items-center justify-center border-4 border-white shadow-sm">
      <span className="text-white font-display font-bold text-2xl">{initials}</span>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function PublicSchedulePage() {
  const { slug } = useParams()

  const [vendor,    setVendor]    = useState(null)
  const [locations, setLocations] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [notFound,  setNotFound]  = useState(false)

  useEffect(() => {
    async function load() {
      // Load vendor (public read policy from migration 002)
      const { data: v, error: vErr } = await supabase
        .from('vendors')
        .select('id, name, slug, logo_url, description')
        .eq('slug', slug)
        .eq('onboarding_complete', true)
        .single()

      if (vErr || !v) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setVendor(v)

      // Load upcoming locations (public read policy from migration 003)
      const { data: locs } = await supabase
        .from('locations')
        .select('id, address, date, start_time, end_time, notes, is_recurring')
        .eq('vendor_id', v.id)
        .gte('date', todayISO())
        .order('date',       { ascending: true })
        .order('start_time', { ascending: true })
        .limit(30)

      setLocations(locs || [])
      setLoading(false)
    }
    load()
  }, [slug])

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafaf8] flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-[#999]" />
      </div>
    )
  }

  // ── 404 ───────────────────────────────────────────────────────────────────

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#fafaf8] flex flex-col items-center justify-center px-6 text-center">
        <p className="text-[#1a1a1a] font-display font-bold text-2xl mb-2">Truck not found</p>
        <p className="text-[#666] text-sm">
          This link may be incorrect or the truck may have moved on.
        </p>
      </div>
    )
  }

  // Group locations by date
  const grouped = locations.reduce((acc, loc) => {
    ;(acc[loc.date] ??= []).push(loc)
    return acc
  }, {})
  const dates = Object.keys(grouped).sort()

  // ── Page ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#fafaf8]">

      {/* Vendor header */}
      <div className="bg-white border-b border-[#e5e5e3]">
        <div className="max-w-lg mx-auto px-6 py-8 flex flex-col items-center text-center">
          <VendorAvatar vendor={vendor} />
          <h1 className="font-display font-bold text-2xl text-[#1a1a1a] mt-4">
            {vendor.name}
          </h1>
          {vendor.description && (
            <p className="text-[#666] text-sm mt-1 max-w-xs leading-relaxed">
              {vendor.description}
            </p>
          )}

          {/* CTA — opt-in link */}
          <Link
            to={`/join/${slug}`}
            className="mt-5 inline-flex items-center gap-2 bg-[#1a1a1a] hover:bg-[#333] text-white font-body font-medium text-sm rounded-xl px-5 py-2.5 transition-colors"
          >
            Get location texts 🌮
          </Link>
        </div>
      </div>

      {/* Schedule */}
      <div className="max-w-lg mx-auto px-6 py-8">
        <h2 className="font-display font-bold text-lg text-[#1a1a1a] mb-5">
          Upcoming Locations
        </h2>

        {dates.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 rounded-full bg-[#f0f0ee] flex items-center justify-center mx-auto mb-3">
              <Calendar size={20} className="text-[#bbb]" />
            </div>
            <p className="font-display font-bold text-[#1a1a1a] text-base mb-1">
              No locations scheduled yet
            </p>
            <p className="text-[#888] font-body text-sm leading-relaxed">
              Subscribe to get a text the moment they post their next spot.
            </p>
            <Link
              to={`/join/${slug}`}
              className="mt-5 inline-flex items-center gap-2 bg-[#1a1a1a] hover:bg-[#333] text-white font-body font-medium text-sm rounded-xl px-5 py-2.5 transition-colors"
            >
              Subscribe now 🌮
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {dates.map(date => (
              <div key={date}>
                {/* Date label */}
                <p className="text-[#999] font-body text-xs font-semibold uppercase tracking-wider mb-3">
                  {formatDateLabel(date)}
                </p>

                {/* Location cards */}
                <div className="flex flex-col gap-2">
                  {grouped[date].map(loc => (
                    <div
                      key={loc.id}
                      className="bg-white border border-[#e5e5e3] rounded-xl p-4"
                    >
                      {/* Address */}
                      <div className="flex items-start gap-2 mb-1.5">
                        <MapPin size={14} className="text-[#1a1a1a] mt-0.5 flex-shrink-0" />
                        <p className="text-[#1a1a1a] font-body text-sm font-medium leading-snug">
                          {loc.address}
                        </p>
                      </div>

                      {/* Time */}
                      <div className="flex items-center gap-2 pl-5">
                        <Clock size={12} className="text-[#aaa] flex-shrink-0" />
                        <span className="text-[#666] font-body text-xs">
                          {formatTime(loc.start_time)} – {formatTime(loc.end_time)}
                        </span>
                      </div>

                      {/* Notes */}
                      {loc.notes && (
                        <p className="text-[#888] font-body text-xs mt-1.5 pl-5 italic leading-relaxed">
                          {loc.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
