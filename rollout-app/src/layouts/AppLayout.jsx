import { useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LiveLocationWidget } from '../components/LiveLocationWidget'
import {
  LayoutDashboard,
  MapPin,
  MessageSquare,
  Users,
  BarChart2,
  QrCode,
  Settings,
  CreditCard,
  LogOut,
  MoreHorizontal,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

async function doSignOut() {
  await supabase.auth.signOut({ scope: 'local' })
  window.location.replace('/login')
}

const NAV_ITEMS = [
  { to: '/dashboard',    label: 'Dashboard',   icon: LayoutDashboard },
  { to: '/locations',    label: 'Locations',    icon: MapPin },
  { to: '/inbox',        label: 'Inbox',        icon: MessageSquare,  badge: true },
  { to: '/subscribers',  label: 'Subscribers',  icon: Users },
  { to: '/analytics',    label: 'Analytics',    icon: BarChart2 },
  { to: '/qr-code',      label: 'QR Code',      icon: QrCode },
]

// Items shown only in the sidebar bottom section (not in main nav)
const SIDEBAR_BOTTOM_ITEMS = [
  { to: '/billing',  label: 'Billing',  icon: CreditCard },
  { to: '/settings', label: 'Settings', icon: Settings },
]

// Items shown in the "More" bottom sheet on mobile
const MORE_ITEMS = [
  { to: '/analytics', label: 'Analytics', icon: BarChart2 },
  { to: '/qr-code',   label: 'QR Code',   icon: QrCode },
  { to: '/settings',  label: 'Settings',  icon: Settings },
  { to: '/billing',   label: 'Billing',   icon: CreditCard },
]

// ── Logo ──────────────────────────────────────────────────────────────────────

function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-5 py-5">
      <div className="w-8 h-8 rounded-full bg-accent flex-shrink-0" />
      <span className="font-display font-bold text-xl text-text-primary tracking-tight">
        Rollout
      </span>
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({ unreadCount }) {
  return (
    <aside className="hidden md:flex flex-col w-60 min-h-screen bg-surface border-r border-border flex-shrink-0">
      <Logo />

      <div className="h-px bg-border mx-4 mb-2" />

      {/* Nav items */}
      <nav className="flex-1 flex flex-col gap-0.5 px-2 py-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon, badge }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body font-medium transition-colors relative
              ${isActive
                ? 'bg-accent-muted text-accent border-l-4 border-accent pl-2'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-raised border-l-4 border-transparent pl-2'
              }`
            }
          >
            <Icon size={18} />
            <span>{label}</span>
            {badge && unreadCount > 0 && (
              <span className="ml-auto w-2 h-2 rounded-full bg-error" />
            )}
          </NavLink>
        ))}
      </nav>

      {/* Live Location Widget */}
      <LiveLocationWidget />

      {/* Bottom: Billing + Settings + Sign out */}
      <div className="px-2 pb-4 flex flex-col gap-0.5">
        <div className="h-px bg-border mx-2 mb-2" />
        {SIDEBAR_BOTTOM_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body font-medium transition-colors
              ${isActive
                ? 'bg-accent-muted text-accent border-l-4 border-accent pl-2'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-raised border-l-4 border-transparent pl-2'
              }`
            }
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}

        <button
          onClick={doSignOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body font-medium text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors border-l-4 border-transparent pl-2 w-full text-left"
        >
          <LogOut size={18} />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  )
}

// ── Bottom Nav ────────────────────────────────────────────────────────────────

function BottomNav({ unreadCount }) {
  const navigate = useNavigate()
  const [showMore, setShowMore] = useState(false)

  // First 4 primary nav items shown as bottom tabs
  const MOBILE_ITEMS = NAV_ITEMS.slice(0, 4)

  return (
    <>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-surface border-t border-border flex items-center z-50">
        {MOBILE_ITEMS.map(({ to, label, icon: Icon, badge }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-1 py-2 text-xs font-body transition-colors
              ${isActive ? 'text-accent' : 'text-text-tertiary'}`
            }
          >
            <div className="relative">
              <Icon size={20} />
              {badge && unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-error" />
              )}
            </div>
            <span className="truncate max-w-[48px]">{label}</span>
          </NavLink>
        ))}

        {/* More button (5th slot) */}
        <button
          onClick={() => setShowMore(true)}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-2 text-xs font-body text-text-tertiary transition-colors"
        >
          <MoreHorizontal size={20} />
          <span>More</span>
        </button>
      </nav>

      {/* More bottom sheet */}
      {showMore && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/60"
          onClick={() => setShowMore(false)}
        >
          <div
            className="absolute bottom-16 left-0 right-0 bg-[#141414] border-t border-[#2a2a2a] rounded-t-2xl p-4"
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle indicator */}
            <div className="w-10 h-1 bg-[#2a2a2a] rounded-full mx-auto mb-4" />

            <p className="text-xs font-medium text-text-tertiary font-body mb-3 px-1">More</p>

            <div className="grid grid-cols-4 gap-2 mb-4">
              {MORE_ITEMS.map(({ to, label, icon: Icon }) => (
                <button
                  key={to}
                  onClick={() => { navigate(to); setShowMore(false) }}
                  className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl bg-[#1c1c1c] hover:bg-[#242424] transition-colors"
                >
                  <Icon size={22} className="text-text-secondary" />
                  <span className="text-[10px] font-body text-text-tertiary truncate w-full text-center">{label}</span>
                </button>
              ))}
            </div>

            {/* Sign out */}
            <button
              onClick={() => { setShowMore(false); doSignOut() }}
              className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl border border-[#2a2a2a] text-text-secondary hover:text-text-primary hover:bg-[#1c1c1c] transition-colors"
            >
              <LogOut size={18} />
              <span className="text-sm font-body font-medium">Sign out</span>
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// ── AppLayout ─────────────────────────────────────────────────────────────────

export function AppLayout() {
  const { vendor } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!vendor) return

    // Initial count
    supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_id', vendor.id)
      .eq('status', 'open')
      .then(({ count }) => setUnreadCount(count ?? 0))

    // Real-time subscription
    const channel = supabase
      .channel('conversations-count')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'conversations',
        filter: `vendor_id=eq.${vendor.id}`
      }, () => {
        supabase
          .from('conversations')
          .select('id', { count: 'exact', head: true })
          .eq('vendor_id', vendor.id)
          .eq('status', 'open')
          .then(({ count }) => setUnreadCount(count ?? 0))
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [vendor])

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar unreadCount={unreadCount} />

      {/* Main content */}
      <main className="flex-1 overflow-auto pb-16 md:pb-0">
        <Outlet />
      </main>

      <BottomNav unreadCount={unreadCount} />
    </div>
  )
}
