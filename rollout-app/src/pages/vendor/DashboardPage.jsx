import { useState, useEffect } from 'react'
import { Users, MapPin, MessageSquare, Smile, Clock, TrendingUp, Plus, QrCode, MessageCircle } from 'lucide-react'
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

function weekAgoISO() {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString()
}

// (480) 867-••09 — area code + exchange visible, last 4 partially masked
function maskPhone(e164) {
  const digits = (e164 ?? '').replace(/\D/g, '')
  if (digits.length === 11 && digits[0] === '1') {
    const area = digits.slice(1, 4)
    const exch = digits.slice(4, 7)
    const last = digits.slice(9, 11)
    return `(${area}) ${exch}-••${last}`
  }
  return e164 ?? ''
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hrs   = Math.floor(mins / 60)
  const days  = Math.floor(hrs / 24)
  if (mins < 2)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hrs < 24)  return `${hrs}h ago`
  if (days === 1) return 'yesterday'
  if (days < 7)  return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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

// Build an array of the 7 days for the current week (Mon–Sun)
function getCurrentWeekDays() {
  const today = new Date()
  const dayOfWeek = today.getDay() // 0 = Sun
  // Monday = dayOfWeek 1; shift so Monday is index 0
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7))
  monday.setHours(0, 0, 0, 0)

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return {
      iso: [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0'),
      ].join('-'),
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dateNum: d.getDate(),
    }
  })
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

// ── Stat Card Skeleton ────────────────────────────────────────────────────────

function StatCardSkeleton() {
  return (
    <div className="bg-[#141414] border border-border rounded-xl p-5 flex flex-col gap-3 animate-pulse">
      <div className="w-9 h-9 rounded-lg bg-surface-raised" />
      <div>
        <div className="h-7 w-16 bg-surface-raised rounded mb-2" />
        <div className="h-3.5 w-28 bg-surface-raised rounded" />
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

// ── Recent Subscriber Row ─────────────────────────────────────────────────────

function RecentSubscriberRow({ sub }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-border last:border-0">
      <div className="w-8 h-8 rounded-full bg-accent-muted flex items-center justify-center flex-shrink-0">
        <Users size={14} className="text-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-text-primary font-body text-sm font-medium font-mono tracking-wide">
          {maskPhone(sub.phone_number)}
        </p>
        <p className="text-text-tertiary font-body text-xs mt-0.5">
          {timeAgo(sub.opted_in_at)}
        </p>
      </div>
      <span className={`text-[10px] font-body font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
        sub.is_active
          ? 'text-success bg-success-muted'
          : 'text-text-tertiary bg-surface-raised'
      }`}>
        {sub.is_active ? 'Active' : 'Opted out'}
      </span>
    </div>
  )
}

// ── Week Strip ────────────────────────────────────────────────────────────────

function WeekStrip({ weekDays, weekLocations, loading }) {
  const todayISO_ = todayISO()

  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-xl p-5 mb-6 animate-pulse">
        <div className="h-4 w-32 bg-surface-raised rounded mb-4" />
        <div className="flex gap-3 overflow-x-auto pb-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-20 h-20 bg-surface-raised rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-text-secondary" />
          <h2 className="font-display font-bold text-base text-text-primary">This Week</h2>
        </div>
        <Link
          to="/locations"
          className="text-xs font-body font-medium text-accent hover:text-accent-hover transition-colors"
        >
          Manage →
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {weekDays.map(day => {
          const isToday = day.iso === todayISO_
          const loc = weekLocations.find(l => l.date === day.iso)

          return (
            <div
              key={day.iso}
              className={`flex-shrink-0 w-[80px] rounded-xl p-2.5 flex flex-col items-center gap-1.5 border transition-colors ${
                isToday
                  ? 'border-accent bg-accent-muted'
                  : 'border-border bg-surface-raised'
              }`}
            >
              <p className={`font-body text-[11px] font-medium ${isToday ? 'text-accent' : 'text-text-secondary'}`}>
                {day.label}
              </p>
              <p className={`font-body text-sm font-semibold ${isToday ? 'text-accent' : 'text-text-primary'}`}>
                {day.dateNum}
              </p>

              {loc ? (
                <div className="w-full flex flex-col items-center gap-1 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                  <p className="font-body text-[10px] text-text-secondary text-center leading-tight line-clamp-2 w-full">
                    {loc.name || loc.address || 'Location'}
                  </p>
                </div>
              ) : (
                <Link
                  to="/locations"
                  className="mt-0.5 w-10 h-10 rounded-lg border border-dashed border-border flex items-center justify-center hover:border-accent transition-colors group"
                >
                  <Plus size={12} className="text-text-tertiary group-hover:text-accent transition-colors" />
                </Link>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Open Conversations Preview ────────────────────────────────────────────────

function OpenConversationsCard({ conversations, loading }) {
  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-xl p-5 animate-pulse">
        <div className="h-4 w-40 bg-surface-raised rounded mb-4" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-3 border-b border-border last:border-0">
            <div className="w-8 h-8 rounded-full bg-surface-raised flex-shrink-0" />
            <div className="flex-1">
              <div className="h-3.5 w-28 bg-surface-raised rounded mb-1.5" />
              <div className="h-3 w-40 bg-surface-raised rounded" />
            </div>
            <div className="h-3 w-12 bg-surface-raised rounded" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageCircle size={16} className="text-text-secondary" />
          <h2 className="font-display font-bold text-base text-text-primary">Open Conversations</h2>
        </div>
        <Link
          to="/inbox"
          className="text-xs font-body font-medium text-accent hover:text-accent-hover transition-colors"
        >
          View all →
        </Link>
      </div>

      {conversations.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-text-secondary font-body text-sm mb-1">
            No open conversations — your customers are happy! 🎉
          </p>
          <p className="text-text-tertiary font-body text-xs">
            Replies from customers will appear here.
          </p>
        </div>
      ) : (
        <div>
          {conversations.map(conv => {
            const phone = conv.subscribers?.phone_number ?? ''
            const msgs = conv.conversation_messages ?? []
            const lastMsg = msgs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
            const preview = lastMsg ? lastMsg.body.slice(0, 40) + (lastMsg.body.length > 40 ? '…' : '') : 'No messages'
            const timestamp = lastMsg ? timeAgo(lastMsg.created_at) : timeAgo(conv.created_at)

            return (
              <div key={conv.id} className="flex items-center gap-3 py-3 border-b border-border last:border-0">
                <div className="w-8 h-8 rounded-full bg-accent-muted flex items-center justify-center flex-shrink-0">
                  <MessageSquare size={14} className="text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-text-primary font-body text-sm font-medium font-mono tracking-wide">
                    {maskPhone(phone)}
                  </p>
                  <p className="text-text-tertiary font-body text-xs mt-0.5 truncate">
                    {preview}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <p className="text-text-tertiary font-body text-xs">{timestamp}</p>
                  <Link
                    to="/inbox"
                    className="text-[10px] font-body font-medium text-accent hover:text-accent-hover transition-colors"
                  >
                    View →
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { vendor, loading: authLoading } = useAuth()

  const [loading, setLoading]                     = useState(true)
  const [subscriberCount, setSubscriberCount]     = useState(0)
  const [newThisWeek, setNewThisWeek]             = useState(0)
  const [todayLocations, setTodayLocations]       = useState([])
  const [smsThisMonth, setSmsThisMonth]           = useState(0)
  const [sentiment, setSentiment]                 = useState({ happy: 0, unhappy: 0 })
  const [recentSubscribers, setRecentSubscribers] = useState([])
  const [weekLocations, setWeekLocations]         = useState([])
  const [openConversations, setOpenConversations] = useState([])

  const weekDays = getCurrentWeekDays()

  // isLoading covers both: auth still resolving (authLoading) and data fetching (loading)
  const isLoading = authLoading || loading

  useEffect(() => {
    if (vendor) loadDashboard()
    else setLoading(false)
  }, [vendor])

  async function loadDashboard() {
    setLoading(true)
    const today      = todayISO()
    const monthStart = startOfMonthISO()

    // Compute week range (Mon–Sun)
    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
    weekStart.setHours(0, 0, 0, 0)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)
    const weekStartISO = weekStart.toISOString().split('T')[0]
    const weekEndISO   = weekEnd.toISOString().split('T')[0]

    const [
      { count: subCount },
      { count: weekCount },
      { data: locations },
      { count: smsCount },
      { data: sentimentData },
      { data: recentSubData },
      { data: weekLocs },
      { data: openConvs },
    ] = await Promise.all([
      // Active subscriber count
      supabase
        .from('subscribers')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_id', vendor.id)
        .eq('is_active', true),

      // New subscribers this week
      supabase
        .from('subscribers')
        .select('*', { count: 'exact', head: true })
        .eq('vendor_id', vendor.id)
        .gte('opted_in_at', weekAgoISO()),

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

      // Last 5 subscribers (proof feed)
      supabase
        .from('subscribers')
        .select('id, phone_number, opted_in_at, is_active')
        .eq('vendor_id', vendor.id)
        .order('opted_in_at', { ascending: false })
        .limit(5),

      // This week's locations for the strip
      supabase
        .from('locations')
        .select('id, name, date, start_time, end_time, address')
        .eq('vendor_id', vendor.id)
        .gte('date', weekStartISO)
        .lte('date', weekEndISO),

      // Open conversations (up to 3)
      supabase
        .from('conversations')
        .select(`
          id,
          created_at,
          subscribers (phone_number),
          conversation_messages (body, created_at)
        `)
        .eq('vendor_id', vendor.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(3),
    ])

    setSubscriberCount(subCount ?? 0)
    setNewThisWeek(weekCount ?? 0)
    setTodayLocations(locations ?? [])
    setSmsThisMonth(smsCount ?? 0)

    const happy   = (sentimentData ?? []).filter(r => r.response === 'happy').length
    const unhappy = (sentimentData ?? []).filter(r => r.response === 'unhappy').length
    setSentiment({ happy, unhappy })

    setRecentSubscribers(recentSubData ?? [])
    setWeekLocations(weekLocs ?? [])
    setOpenConversations(openConvs ?? [])
    setLoading(false)
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
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            icon={Users}
            label="Active subscribers"
            value={subscriberCount}
            sub={newThisWeek > 0 ? `↑ ${newThisWeek} new this week` : undefined}
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
      )}

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Link
          to="/locations"
          className="border border-[#2a2a2a] bg-[#141414] text-[#f5f5f5] hover:border-[#FF6B35] text-sm py-2 px-4 rounded-lg transition-colors flex items-center gap-1.5"
        >
          <Plus size={14} />
          Add Today's Location
        </Link>
        <Link
          to="/qr"
          className="border border-[#2a2a2a] bg-[#141414] text-[#f5f5f5] hover:border-[#FF6B35] text-sm py-2 px-4 rounded-lg transition-colors flex items-center gap-1.5"
        >
          <QrCode size={14} />
          Download QR Code
        </Link>
      </div>

      {/* 7-Day Schedule Strip */}
      <WeekStrip weekDays={weekDays} weekLocations={weekLocations} loading={isLoading} />

      {/* Open Conversations */}
      <div className="mb-6">
        <OpenConversationsCard conversations={openConversations} loading={isLoading} />
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

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 py-3 border-b border-border last:border-0 animate-pulse">
                  <div className="w-8 h-8 rounded-lg bg-surface-raised flex-shrink-0" />
                  <div className="flex-1">
                    <div className="h-3.5 w-40 bg-surface-raised rounded mb-1.5" />
                    <div className="h-3 w-24 bg-surface-raised rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : todayLocations.length === 0 ? (
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

        {/* Recent Subscribers */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-text-secondary" />
              <h2 className="font-display font-bold text-base text-text-primary">Recent Subscribers</h2>
            </div>
            <Link
              to="/subscribers"
              className="text-xs font-body font-medium text-accent hover:text-accent-hover transition-colors"
            >
              View all →
            </Link>
          </div>

          {isLoading ? (
            <div className="space-y-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-3 border-b border-border last:border-0 animate-pulse">
                  <div className="w-8 h-8 rounded-full bg-surface-raised flex-shrink-0" />
                  <div className="flex-1">
                    <div className="h-3.5 w-28 bg-surface-raised rounded mb-1.5" />
                    <div className="h-3 w-16 bg-surface-raised rounded" />
                  </div>
                  <div className="h-5 w-14 bg-surface-raised rounded-full" />
                </div>
              ))}
            </div>
          ) : recentSubscribers.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-text-secondary font-body text-sm mb-3">
                No subscribers yet.
              </p>
              <Link
                to="/qr-code"
                className="inline-flex items-center gap-1.5 text-sm font-body font-medium text-accent hover:text-accent-hover transition-colors"
              >
                <QrCode size={14} />
                Get your QR code
              </Link>
            </div>
          ) : (
            <div>
              {recentSubscribers.map(sub => (
                <RecentSubscriberRow key={sub.id} sub={sub} />
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
