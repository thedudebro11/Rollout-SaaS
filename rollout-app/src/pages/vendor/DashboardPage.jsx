import { useState, useEffect } from 'react'
import { Users, MapPin, MessageSquare, Smile, Clock, TrendingUp, Loader2, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
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

function startOfMonthISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function formatTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5 flex flex-col gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${accent ? 'bg-accent-muted' : 'bg-surface-raised'}`}>
        <Icon size={18} className={accent ? 'text-accent' : 'text-text-secondary'} />
      </div>
      <div>
        <p className="font-display font-bold text-2xl text-text-primary leading-none mb-1">
          {value}
        </p>
        <p className="text-text-secondary font-body text-sm">{label}</p>
        {sub && (
          <p className="text-text-tertiary font-body text-xs mt-0.5">{sub}</p>
        )}
      </div>
    </div>
  )
}

// ── Today's Location Card ─────────────────────────────────────────────────────

function TodayLocationCard({ loc }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      <div className="w-8 h-8 rounded-lg bg-accent-muted flex items-center justify-center flex-shrink-0 mt-0.5">
        <MapPin size={14} className="text-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-text-primary font-body text-sm font-medium leading-snug truncate">
          {loc.address}
        </p>
        <p className="text-text-tertiary font-body text-xs mt-0.5">
          {formatTime(loc.start_time)} – {formatTime(loc.end_time)}
          {loc.notes && ` · ${loc.notes}`}
        </p>
      </div>
      {loc.morning_sms_sent && (
        <span className="text-[10px] font-body font-medium text-success bg-success-muted px-2 py-0.5 rounded-full flex-shrink-0 mt-1">
          SMS sent
        </span>
      )}
    </div>
  )
}

// ── Recent SMS Row ────────────────────────────────────────────────────────────

const TYPE_LABELS = {
  location_notify:  'Morning SMS',
  sentiment_ask:    'Sentiment ask',
  sentiment_happy:  'Happy reply',
  sentiment_unhappy:'Unhappy reply',
  opt_in_confirm:   'Opt-in confirm',
  idle_reply:       'Customer reply',
  vendor_reply:     'Your reply',
  other:            'SMS',
}

function RecentSmsRow({ entry }) {
  const label = TYPE_LABELS[entry.message_type] ?? 'SMS'
  const time  = new Date(entry.created_at).toLocaleTimeString('en-US', {
    hour:   'numeric',
    minute: '2-digit',
    hour12: true,
  })
  const date = new Date(entry.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day:   'numeric',
  })

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${entry.direction === 'inbound' ? 'bg-accent' : 'bg-success'}`} />
      <div className="flex-1 min-w-0">
        <p className="text-text-primary font-body text-sm truncate">{entry.message_body}</p>
        <p className="text-text-tertiary font-body text-xs mt-0.5">{label}</p>
      </div>
      <p className="text-text-tertiary font-body text-xs flex-shrink-0 text-right">
        {date}<br />{time}
      </p>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { vendor } = useAuth()

  const [loading, setLoading]           = useState(true)
  const [subscriberCount, setSubscriberCount] = useState(0)
  const [todayLocations, setTodayLocations]   = useState([])
  const [smsThisMonth, setSmsThisMonth]       = useState(0)
  const [sentiment, setSentiment]             = useState({ happy: 0, unhappy: 0 })
  const [recentSms, setRecentSms]             = useState([])

  useEffect(() => {
    if (vendor) loadDashboard()
  }, [vendor])

  async function loadDashboard() {
    setLoading(true)
    const today    = todayISO()
    const monthStart = startOfMonthISO()

    const [
      { count: subCount },
      { data: locations },
      { count: smsCount },
      { data: sentimentData },
      { data: recentData },
    ] = await Promise.all([
      // Active subscriber count
      supabase
        .from('subscribers')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_id', vendor.id)
        .eq('is_active', true),

      // Today's locations
      supabase
        .from('locations')
        .select('id, address, start_time, end_time, notes, morning_sms_sent')
        .eq('vendor_id', vendor.id)
        .eq('date', today)
        .order('start_time', { ascending: true }),

      // Outbound SMS this month
      supabase
        .from('sms_log')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_id', vendor.id)
        .eq('direction', 'outbound')
        .gte('created_at', monthStart),

      // Sentiment responses (all time)
      supabase
        .from('sentiment_responses')
        .select('response')
        .eq('vendor_id', vendor.id),

      // Recent SMS log (last 5)
      supabase
        .from('sms_log')
        .select('id, message_body, message_type, direction, created_at')
        .eq('vendor_id', vendor.id)
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    setSubscriberCount(subCount ?? 0)
    setTodayLocations(locations ?? [])
    setSmsThisMonth(smsCount ?? 0)

    const happy   = (sentimentData ?? []).filter(r => r.response === 'happy').length
    const unhappy = (sentimentData ?? []).filter(r => r.response === 'unhappy').length
    setSentiment({ happy, unhappy })

    setRecentSms(recentData ?? [])
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-text-tertiary" />
      </div>
    )
  }

  const totalSentiment = sentiment.happy + sentiment.unhappy
  const happyPct = totalSentiment > 0
    ? Math.round((sentiment.happy / totalSentiment) * 100)
    : null

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">

      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display font-bold text-2xl text-text-primary">
          {greeting()}, {vendor?.name ?? 'there'} 👋
        </h1>
        <p className="text-text-secondary font-body text-sm mt-1">
          Here's what's happening with your truck today.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={Users}
          label="Active subscribers"
          value={subscriberCount}
          accent
        />
        <StatCard
          icon={MapPin}
          label="Locations today"
          value={todayLocations.length}
          sub={todayLocations.length === 0 ? 'None scheduled' : undefined}
        />
        <StatCard
          icon={MessageSquare}
          label="SMS sent this month"
          value={smsThisMonth}
        />
        <StatCard
          icon={Smile}
          label="Happy customers"
          value={happyPct !== null ? `${happyPct}%` : '—'}
          sub={totalSentiment > 0 ? `${totalSentiment} responses` : 'No responses yet'}
        />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Today's Schedule */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-text-secondary" />
              <h2 className="font-display font-bold text-base text-text-primary">Today's Schedule</h2>
            </div>
            <Link
              to="/locations"
              className="text-xs font-body font-medium text-accent hover:text-accent-hover transition-colors"
            >
              Manage →
            </Link>
          </div>

          {todayLocations.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-text-secondary font-body text-sm mb-3">
                No locations scheduled for today.
              </p>
              <Link
                to="/locations"
                className="inline-flex items-center gap-1.5 text-sm font-body font-medium text-accent hover:text-accent-hover transition-colors"
              >
                <Plus size={14} />
                Add a location
              </Link>
            </div>
          ) : (
            <div>
              {todayLocations.map(loc => (
                <TodayLocationCard key={loc.id} loc={loc} />
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-text-secondary" />
              <h2 className="font-display font-bold text-base text-text-primary">Recent Activity</h2>
            </div>
          </div>

          {recentSms.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-text-secondary font-body text-sm">
                No SMS activity yet.
              </p>
            </div>
          ) : (
            <div>
              {recentSms.map(entry => (
                <RecentSmsRow key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
