import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

// Full-page loader shown while session is being determined
function LoadingScreen() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-accent animate-pulse" />
        <span className="text-text-secondary text-sm font-body">Loading...</span>
      </div>
    </div>
  )
}

// Protects all routes inside AppLayout.
// Renders the outlet immediately so the page skeleton is visible during auth resolution —
// this is what allows LCP to fire on the skeleton rather than waiting for Supabase.
// We only redirect once we are certain (loading=false) there is no session.
export function ProtectedRoute() {
  const { session, loading, vendor } = useAuth()

  if (!loading && !session) return <Navigate to="/login" replace />

  if (!loading && vendor && !vendor.onboarding_complete) {
    const currentPath = window.location.pathname
    if (currentPath !== '/onboarding') {
      return <Navigate to="/onboarding" replace />
    }
  }

  return <Outlet />
}

// Used on auth pages — if already logged in, go to dashboard
export function PublicOnlyRoute() {
  const { session, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (session) return <Navigate to="/dashboard" replace />

  return <Outlet />
}
