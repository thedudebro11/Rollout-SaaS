import { useState, useEffect, useRef, useCallback } from 'react'
import { Radio, MapPin, X, Loader2, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// ── Constants ─────────────────────────────────────────────────────────────────

const PING_INTERVAL_MS  = 30_000   // Update location every 30 seconds
const STALE_THRESHOLD_S = 300      // Consider stale after 5 minutes

// ── Reverse geocode via OpenStreetMap Nominatim (free, no API key) ────────────

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'Accept-Language': 'en' } }
    )
    const data = await res.json()
    // Build a clean street address from the response
    const a = data.address ?? {}
    const parts = [
      a.house_number && a.road ? `${a.house_number} ${a.road}` : a.road,
      a.city ?? a.town ?? a.village ?? a.county,
      a.state,
    ].filter(Boolean)
    return parts.join(', ') || data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
  }
}

// ── Elapsed timer display ─────────────────────────────────────────────────────

function useElapsed(running) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!running) { setSeconds(0); return }
    const t = setInterval(() => setSeconds(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [running])
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// ── Main Widget ───────────────────────────────────────────────────────────────

export function LiveLocationWidget() {
  const { vendor } = useAuth()

  const [isLive,    setIsLive]    = useState(false)
  const [address,   setAddress]   = useState('')
  const [error,     setError]     = useState('')
  const [starting,  setStarting]  = useState(false)

  const watchIdRef   = useRef(null)
  const intervalRef  = useRef(null)
  const latLngRef    = useRef(null)  // Latest coords for the interval to use
  const elapsed      = useElapsed(isLive)

  // ── Push location to Supabase ──────────────────────────────────────────────

  const pushLocation = useCallback(async (lat, lng) => {
    const addr = await reverseGeocode(lat, lng)
    setAddress(addr)

    await supabase.from('vendors').update({
      is_live:         true,
      live_lat:        lat,
      live_lng:        lng,
      live_address:    addr,
      live_updated_at: new Date().toISOString(),
    }).eq('id', vendor.id)
  }, [vendor?.id])

  // ── Stop live session ──────────────────────────────────────────────────────

  const stopLive = useCallback(async () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    clearInterval(intervalRef.current)
    intervalRef.current = null
    latLngRef.current   = null

    await supabase.from('vendors').update({
      is_live:         false,
      live_lat:        null,
      live_lng:        null,
      live_address:    null,
      live_updated_at: null,
    }).eq('id', vendor.id)

    setIsLive(false)
    setAddress('')
    setError('')
  }, [vendor?.id])

  // ── Auto-stop on tab close ─────────────────────────────────────────────────

  useEffect(() => {
    const handle = () => { if (isLive) stopLive() }
    window.addEventListener('beforeunload', handle)
    return () => window.removeEventListener('beforeunload', handle)
  }, [isLive, stopLive])

  // ── Cleanup on unmount ─────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
      clearInterval(intervalRef.current)
    }
  }, [])

  // ── Start live session ─────────────────────────────────────────────────────

  async function startLive() {
    if (!navigator.geolocation) {
      setError('Your browser does not support location sharing.')
      return
    }

    setStarting(true)
    setError('')

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        latLngRef.current = { lat, lng }

        await pushLocation(lat, lng)
        setIsLive(true)
        setStarting(false)

        // Watch for position changes
        watchIdRef.current = navigator.geolocation.watchPosition(
          (p) => { latLngRef.current = { lat: p.coords.latitude, lng: p.coords.longitude } },
          () => {},
          { enableHighAccuracy: true, maximumAge: 10_000 }
        )

        // Periodic push to Supabase
        intervalRef.current = setInterval(() => {
          if (latLngRef.current) {
            pushLocation(latLngRef.current.lat, latLngRef.current.lng)
          }
        }, PING_INTERVAL_MS)
      },
      (err) => {
        setStarting(false)
        if (err.code === 1) setError('Location permission denied. Allow location access in your browser settings.')
        else setError('Could not get your location. Please try again.')
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    )
  }

  if (!vendor) return null

  // ── Live state UI ──────────────────────────────────────────────────────────

  if (isLive) {
    return (
      <div className="mx-2 mb-2 rounded-xl bg-success/10 border border-success/30 p-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {/* Pulsing dot */}
            <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
            </span>
            <span className="text-success font-body text-xs font-bold uppercase tracking-wider">
              Live · {elapsed}
            </span>
          </div>
          <button
            onClick={stopLive}
            className="text-text-tertiary hover:text-text-primary transition-colors p-0.5 rounded"
            title="Stop live location"
          >
            <X size={14} />
          </button>
        </div>

        {/* Address */}
        {address && (
          <div className="flex items-start gap-1.5">
            <MapPin size={11} className="text-success mt-0.5 flex-shrink-0" />
            <p className="text-text-secondary font-body text-xs leading-snug">{address}</p>
          </div>
        )}
      </div>
    )
  }

  // ── Idle state UI ──────────────────────────────────────────────────────────

  return (
    <div className="mx-2 mb-2">
      {error && (
        <div className="flex items-start gap-1.5 mb-2 px-2">
          <AlertCircle size={12} className="text-error mt-0.5 flex-shrink-0" />
          <p className="text-error font-body text-xs leading-snug">{error}</p>
        </div>
      )}
      <button
        onClick={startLive}
        disabled={starting}
        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-border hover:border-success hover:bg-success/5 text-text-tertiary hover:text-success transition-all text-xs font-body font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {starting
          ? <><Loader2 size={13} className="animate-spin" /> Getting location…</>
          : <><Radio size={13} /> Go Live</>
        }
      </button>
    </div>
  )
}
