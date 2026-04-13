import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { MapPin, Clock, Calendar, Loader2, Radio } from 'lucide-react'
import { supabase } from '../../lib/supabase'

// ── Constants ─────────────────────────────────────────────────────────────────

const STALE_THRESHOLD_MS = 5 * 60 * 1000  // 5 minutes

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

function timeAgoShort(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60)  return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60)  return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

function isLiveActive(vendor) {
  if (!vendor?.is_live) return false
  if (!vendor?.live_updated_at) return false
  return Date.now() - new Date(vendor.live_updated_at).getTime() < STALE_THRESHOLD_MS
}

// ── Vendor avatar ─────────────────────────────────────────────────────────────

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
  const initials = vendor.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return (
    <div className="w-20 h-20 rounded-full bg-[#1a1a1a] flex items-center justify-center border-4 border-white shadow-sm">
      <span className="text-white font-display font-bold text-2xl">{initials}</span>
    </div>
  )
}

// ── Live Location Banner ──────────────────────────────────────────────────────

function LiveBanner({ vendor }) {
  const [, forceUpdate] = useState(0)

  // Re-render every 10s so "Xs ago" stays fresh
  useEffect(() => {
    const t = setInterval(() => forceUpdate(n => n + 1), 10_000)
    return () => clearInterval(t)
  }, [])

  if (!isLiveActive(vendor)) return null

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${vendor.live_lat},${vendor.live_lng}`

  return (
    <a
      href={mapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-green-50 border border-green-200 rounded-xl p-4 mb-6 hover:bg-green-100 transition-colors"
    >
      <div className="flex items-center gap-2 mb-1.5">
        {/* Pulsing dot */}
        <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
        </span>
        <span className="text-green-700 font-body text-xs font-bold uppercase tracking-wider">
          Live now
        </span>
        <span className="text-green-500 font-body text-xs ml-auto">
          {timeAgoShort(vendor.live_updated_at)}
        </span>
      </div>
      <div className="flex items-start gap-2">
        <MapPin size={13} className="text-green-600 mt-0.5 flex-shrink-0" />
        <p className="text-green-800 font-body text-sm font-medium leading-snug">
          {vendor.live_address}
        </p>
      </div>
      <p className="text-green-600 font-body text-xs mt-1.5 pl-5">
        Tap to open in Maps →
      </p>
    </a>
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
      const { data: v, error: vErr } = await supabase
        .from('vendors')
        .select('id, name, slug, logo_url, description, is_live, live_lat, live_lng, live_address, live_updated_at')
        .eq('slug', slug)
        .eq('onboarding_complete', true)
        .single()

      if (vErr || !v) { setNotFound(true); setLoading(false); return }
      setVendor(v)

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

      // Realtime — update live location fields as vendor pushes pings
      const channel = supabase
        .channel(`vendor-live:${v.id}`)
        .on('postgres_changes', {
          event:  'UPDATE',
          schema: 'public',
          table:  'vendors',
          filter: `id=eq.${v.id}`,
        }, payload => {
          setVendor(prev => ({ ...prev, ...payload.new }))
        })
        .subscribe()

      return () => { supabase.removeChannel(channel) }
    }
    load()
  }, [slug])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafaf8] flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-[#999]" />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#fafaf8] flex flex-col items-center justify-center px-6 text-center">
        <p className="text-[#1a1a1a] font-display font-bold text-2xl mb-2">Truck not found</p>
        <p className="text-[#666] text-sm">This link may be incorrect or the truck may have moved on.</p>
      </div>
    )
  }

  const grouped = locations.reduce((acc, loc) => {
    ;(acc[loc.date] ??= []).push(loc)
    return acc
  }, {})
  const dates = Object.keys(grouped).sort()

  return (
    <div className="min-h-screen bg-[#fafaf8]">

      {/* Vendor header */}
      <div className="bg-white border-b border-[#e5e5e3]">
        <div className="max-w-lg mx-auto px-6 py-8 flex flex-col items-center text-center">
          <VendorAvatar vendor={vendor} />
          <h1 className="font-display font-bold text-2xl text-[#1a1a1a] mt-4">{vendor.name}</h1>
          {vendor.description && (
            <p className="text-[#666] text-sm mt-1 max-w-xs leading-relaxed">{vendor.description}</p>
          )}
          <Link
            to={`/join/${slug}`}
            className="mt-5 inline-flex items-center gap-2 bg-[#1a1a1a] hover:bg-[#333] text-white font-body font-medium text-sm rounded-xl px-5 py-2.5 transition-colors"
          >
            Get location texts 🌮
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-6 py-8">

        {/* Live banner */}
        <LiveBanner vendor={vendor} />

        {/* Schedule */}
        <h2 className="font-display font-bold text-lg text-[#1a1a1a] mb-5">Upcoming Locations</h2>

        {dates.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 rounded-full bg-[#f0f0ee] flex items-center justify-center mx-auto mb-3">
              <Calendar size={20} className="text-[#bbb]" />
            </div>
            <p className="font-display font-bold text-[#1a1a1a] text-base mb-1">No locations scheduled yet</p>
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
                <p className="text-[#999] font-body text-xs font-semibold uppercase tracking-wider mb-3">
                  {formatDateLabel(date)}
                </p>
                <div className="flex flex-col gap-2">
                  {grouped[date].map(loc => (
                    <div key={loc.id} className="bg-white border border-[#e5e5e3] rounded-xl p-4">
                      <div className="flex items-start gap-2 mb-1.5">
                        <MapPin size={14} className="text-[#1a1a1a] mt-0.5 flex-shrink-0" />
                        <p className="text-[#1a1a1a] font-body text-sm font-medium leading-snug">{loc.address}</p>
                      </div>
                      <div className="flex items-center gap-2 pl-5">
                        <Clock size={12} className="text-[#aaa] flex-shrink-0" />
                        <span className="text-[#666] font-body text-xs">
                          {formatTime(loc.start_time)} – {formatTime(loc.end_time)}
                        </span>
                      </div>
                      {loc.notes && (
                        <p className="text-[#888] font-body text-xs mt-1.5 pl-5 italic leading-relaxed">{loc.notes}</p>
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
