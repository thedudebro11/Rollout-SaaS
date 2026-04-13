import { useState, useEffect } from 'react'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { TrendingUp, MessageSquare, Smile, Users, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateStr(iso) {
  return iso.slice(0, 10)  // 'YYYY-MM-DD'
}

function labelDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function last30Days() {
  const days = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(toDateStr(d.toISOString()))
  }
  return days
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, iconColor }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${iconColor ?? 'bg-surface-raised'}`}>
        <Icon size={18} className="text-white" />
      </div>
      <div>
        <p className="font-display font-bold text-2xl text-text-primary leading-none">{value}</p>
        <p className="text-text-secondary font-body text-sm mt-0.5">{label}</p>
        {sub && <p className="text-text-tertiary font-body text-xs mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-border rounded-lg px-3 py-2 shadow-lg">
      <p className="text-text-tertiary font-body text-xs mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-text-primary font-body text-sm font-semibold">
          {p.value} {p.name}
        </p>
      ))}
    </div>
  )
}

// ── Sentiment Bar ─────────────────────────────────────────────────────────────

function SentimentBar({ happy, unhappy }) {
  const total = happy + unhappy
  if (total === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-text-tertiary font-body text-sm">No sentiment responses yet.</p>
      </div>
    )
  }
  const happyPct  = Math.round((happy  / total) * 100)
  const unhappyPct = 100 - happyPct

  return (
    <div>
      {/* Bar */}
      <div className="flex rounded-full overflow-hidden h-4 mb-3">
        {happyPct > 0  && <div className="bg-success transition-all"  style={{ width: `${happyPct}%` }} />}
        {unhappyPct > 0 && <div className="bg-error transition-all"   style={{ width: `${unhappyPct}%` }} />}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-success" />
          <span className="text-text-secondary font-body text-sm">Happy</span>
          <span className="font-display font-bold text-text-primary text-sm">{happy} ({happyPct}%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-error" />
          <span className="text-text-secondary font-body text-sm">Unhappy</span>
          <span className="font-display font-bold text-text-primary text-sm">{unhappy} ({unhappyPct}%)</span>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function AnalyticsPage() {
  const { vendor } = useAuth()

  const [loading, setLoading]       = useState(true)
  const [growthData, setGrowthData] = useState([])
  const [smsData, setSmsData]       = useState([])
  const [sentiment, setSentiment]   = useState({ happy: 0, unhappy: 0 })
  const [totals, setTotals]         = useState({ subscribers: 0, smsSent: 0, deliveryRate: 0 })

  useEffect(() => {
    if (vendor) loadAnalytics()
  }, [vendor])

  async function loadAnalytics() {
    setLoading(true)

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29)
    const cutoff = thirtyDaysAgo.toISOString()

    const [
      { data: subscribers },
      { data: smsLog },
      { data: sentimentData },
    ] = await Promise.all([
      supabase
        .from('subscribers')
        .select('opted_in_at, is_active')
        .eq('vendor_id', vendor.id)
        .order('opted_in_at', { ascending: true }),

      supabase
        .from('sms_log')
        .select('created_at, direction, status')
        .eq('vendor_id', vendor.id)
        .eq('direction', 'outbound')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: true }),

      supabase
        .from('sentiment_responses')
        .select('response')
        .eq('vendor_id', vendor.id),
    ])

    // ── Subscriber growth (cumulative, last 30 days) ──────────────────────────
    const days      = last30Days()
    const allSubs   = subscribers ?? []

    // Count subscribers that existed before each day (cumulative)
    const growth = days.map(day => {
      const count = allSubs.filter(s => toDateStr(s.opted_in_at) <= day).length
      return { date: labelDate(day), subscribers: count }
    })
    setGrowthData(growth)

    // ── SMS per day (last 30 days) ────────────────────────────────────────────
    const smsByDay = {}
    days.forEach(d => { smsByDay[d] = { sent: 0, failed: 0 } })
    ;(smsLog ?? []).forEach(entry => {
      const d = toDateStr(entry.created_at)
      if (smsByDay[d]) {
        if (entry.status === 'sent' || entry.status === 'delivered') smsByDay[d].sent++
        else smsByDay[d].failed++
      }
    })
    const smsChartData = days.map(d => ({
      date:   labelDate(d),
      SMS:    smsByDay[d].sent,
    }))
    setSmsData(smsChartData)

    // ── Sentiment ─────────────────────────────────────────────────────────────
    const happy   = (sentimentData ?? []).filter(r => r.response === 'happy').length
    const unhappy = (sentimentData ?? []).filter(r => r.response === 'unhappy').length
    setSentiment({ happy, unhappy })

    // ── Totals ────────────────────────────────────────────────────────────────
    const activeCount = allSubs.filter(s => s.is_active).length
    const totalSms    = (smsLog ?? []).length
    const sentSms     = (smsLog ?? []).filter(s => s.status === 'sent' || s.status === 'delivered').length
    const rate        = totalSms > 0 ? Math.round((sentSms / totalSms) * 100) : 0

    setTotals({ subscribers: activeCount, smsSent: totalSms, deliveryRate: rate })
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-text-tertiary" />
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">

      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display font-bold text-2xl text-text-primary">Analytics</h1>
        <p className="text-text-secondary font-body text-sm mt-0.5">
          Last 30 days of activity for your truck.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard
          icon={Users}
          label="Active subscribers"
          value={totals.subscribers}
          iconColor="bg-accent"
        />
        <StatCard
          icon={MessageSquare}
          label="SMS sent (30 days)"
          value={totals.smsSent}
          iconColor="bg-success"
        />
        <StatCard
          icon={TrendingUp}
          label="Delivery rate"
          value={`${totals.deliveryRate}%`}
          sub="Sent vs attempted"
          iconColor="bg-accent"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

        {/* Subscriber Growth */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <h2 className="font-display font-bold text-base text-text-primary mb-5">
            Subscriber Growth
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={growthData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="subGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--color-accent)" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)', fontFamily: 'inherit' }}
                tickLine={false}
                axisLine={false}
                interval={6}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)', fontFamily: 'inherit' }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="subscribers"
                name="subscribers"
                stroke="var(--color-accent)"
                strokeWidth={2}
                fill="url(#subGradient)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* SMS Sent Per Day */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <h2 className="font-display font-bold text-base text-text-primary mb-5">
            SMS Sent Per Day
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={smsData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)', fontFamily: 'inherit' }}
                tickLine={false}
                axisLine={false}
                interval={6}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)', fontFamily: 'inherit' }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar
                dataKey="SMS"
                fill="var(--color-accent)"
                radius={[4, 4, 0, 0]}
                maxBarSize={32}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

      </div>

      {/* Sentiment */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-5">
          <Smile size={16} className="text-text-secondary" />
          <h2 className="font-display font-bold text-base text-text-primary">
            Customer Sentiment
          </h2>
          <span className="text-text-tertiary font-body text-xs ml-1">
            ({sentiment.happy + sentiment.unhappy} total responses)
          </span>
        </div>
        <SentimentBar happy={sentiment.happy} unhappy={sentiment.unhappy} />
      </div>

    </div>
  )
}
