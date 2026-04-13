import { useState } from 'react'
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

// Rollout logo mark: orange circle + wordmark
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

      {/* Bottom: Settings + Sign out */}
      <div className="px-2 pb-4 flex flex-col gap-0.5">
        <div className="h-px bg-border mx-2 mb-2" />
        <NavLink
          to="/billing"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body font-medium transition-colors
            ${isActive
              ? 'bg-accent-muted text-accent border-l-4 border-accent pl-2'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-raised border-l-4 border-transparent pl-2'
            }`
          }
        >
          <CreditCard size={18} />
          <span>Billing</span>
        </NavLink>

        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body font-medium transition-colors
            ${isActive
              ? 'bg-accent-muted text-accent border-l-4 border-accent pl-2'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-raised border-l-4 border-transparent pl-2'
            }`
          }
        >
          <Settings size={18} />
          <span>Settings</span>
        </NavLink>

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

function BottomNav({ unreadCount }) {
  const MOBILE_ITEMS = NAV_ITEMS.slice(0, 4)

  return (
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
      <button
        onClick={doSignOut}
        className="flex-1 flex flex-col items-center justify-center gap-1 py-2 text-xs font-body text-text-tertiary transition-colors"
      >
        <LogOut size={20} />
        <span>Sign out</span>
      </button>
    </nav>
  )
}

export function AppLayout() {
  // unreadCount will be wired to real data in Module 7 (Inbox)
  const [unreadCount] = useState(0)

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
