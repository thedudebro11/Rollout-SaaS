import { useState, useEffect } from 'react'
import { Users, UserCheck, UserX, Search, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPhone(e164) {
  const digits = e164.replace(/\D/g, '')
  if (digits.length === 11 && digits[0] === '1') {
    const d = digits.slice(1)
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  }
  return e164
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// ── Stat Badge ────────────────────────────────────────────────────────────────

function StatBadge({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-surface border border-border rounded-xl px-5 py-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={18} className="text-white" />
      </div>
      <div>
        <p className="font-display font-bold text-xl text-text-primary leading-none">{value}</p>
        <p className="text-text-secondary font-body text-xs mt-0.5">{label}</p>
      </div>
    </div>
  )
}

// ── Subscriber Row ────────────────────────────────────────────────────────────

function SubscriberRow({ sub }) {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5 border-b border-border last:border-0 hover:bg-surface-raised transition-colors">
      {/* Status dot */}
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${sub.is_active ? 'bg-success' : 'bg-border'}`} />

      {/* Phone */}
      <p className="flex-1 text-text-primary font-body text-sm font-medium">
        {formatPhone(sub.phone_number)}
      </p>

      {/* Opted in date */}
      <p className="text-text-tertiary font-body text-xs hidden sm:block">
        Joined {formatDate(sub.opted_in_at)}
      </p>

      {/* Status badge */}
      <span className={`text-[10px] font-body font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
        sub.is_active
          ? 'bg-success-muted text-success'
          : 'bg-surface-raised text-text-tertiary border border-border'
      }`}>
        {sub.is_active ? 'Active' : 'Opted out'}
      </span>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function SubscribersPage() {
  const { vendor } = useAuth()

  const [subscribers, setSubscribers] = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [filter, setFilter]           = useState('all')  // 'all' | 'active' | 'opted-out'

  useEffect(() => {
    if (vendor) loadSubscribers()
  }, [vendor])

  async function loadSubscribers() {
    setLoading(true)
    const { data } = await supabase
      .from('subscribers')
      .select('id, phone_number, opted_in_at, is_active')
      .eq('vendor_id', vendor.id)
      .order('opted_in_at', { ascending: false })
    setSubscribers(data ?? [])
    setLoading(false)
  }

  const total    = subscribers.length
  const active   = subscribers.filter(s => s.is_active).length
  const optedOut = total - active

  const filtered = subscribers.filter(sub => {
    const matchesFilter =
      filter === 'all'       ? true :
      filter === 'active'    ? sub.is_active :
      filter === 'opted-out' ? !sub.is_active : true

    const matchesSearch = search.trim() === '' ||
      sub.phone_number.includes(search.replace(/\D/g, ''))

    return matchesFilter && matchesSearch
  })

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto">

      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl text-text-primary">Subscribers</h1>
        <p className="text-text-secondary font-body text-sm mt-0.5">
          Everyone who has opted in to your SMS updates.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatBadge icon={Users}     label="Total"     value={total}    color="bg-accent" />
        <StatBadge icon={UserCheck} label="Active"    value={active}   color="bg-success" />
        <StatBadge icon={UserX}     label="Opted out" value={optedOut} color="bg-border" />
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by phone number…"
            className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2.5 text-text-primary font-body text-sm placeholder-text-tertiary focus:outline-none focus:border-accent transition-colors"
          />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 bg-surface border border-border rounded-lg p-1 flex-shrink-0">
          {[
            { key: 'all',       label: 'All' },
            { key: 'active',    label: 'Active' },
            { key: 'opted-out', label: 'Opted out' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`text-xs font-body font-medium px-3 py-1.5 rounded-md transition-colors ${
                filter === key
                  ? 'bg-accent-muted text-accent'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">

        {/* Column headers */}
        <div className="flex items-center gap-4 px-5 py-2.5 border-b border-border bg-surface-raised">
          <div className="w-2 flex-shrink-0" />
          <p className="flex-1 text-text-tertiary font-body text-xs font-semibold uppercase tracking-wider">Phone</p>
          <p className="text-text-tertiary font-body text-xs font-semibold uppercase tracking-wider hidden sm:block">Joined</p>
          <p className="text-text-tertiary font-body text-xs font-semibold uppercase tracking-wider">Status</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-text-tertiary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-text-secondary font-body text-sm font-medium mb-1">
              {search ? 'No results found' : 'No subscribers yet'}
            </p>
            <p className="text-text-tertiary font-body text-xs">
              {search
                ? 'Try a different phone number.'
                : 'Share your QR code to start growing your list.'}
            </p>
          </div>
        ) : (
          filtered.map(sub => <SubscriberRow key={sub.id} sub={sub} />)
        )}
      </div>

      {/* Footer count */}
      {!loading && filtered.length > 0 && (
        <p className="text-text-tertiary font-body text-xs text-center mt-4">
          Showing {filtered.length} of {total} subscriber{total !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}
