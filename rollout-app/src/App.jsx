import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute, PublicOnlyRoute } from './components/ProtectedRoute'
import { AppLayout } from './layouts/AppLayout'

// Auth pages
import { SignupPage }         from './pages/auth/SignupPage'
import { LoginPage }          from './pages/auth/LoginPage'
import { ForgotPasswordPage }  from './pages/auth/ForgotPasswordPage'
import { ResetPasswordPage }   from './pages/auth/ResetPasswordPage'

// Vendor pages
import { OnboardingPage }   from './pages/vendor/OnboardingPage'
import { DashboardPage }    from './pages/vendor/DashboardPage'
import { LocationsPage }    from './pages/vendor/LocationsPage'
import { InboxPage }        from './pages/vendor/InboxPage'
import { SubscribersPage }  from './pages/vendor/SubscribersPage'
import { AnalyticsPage }    from './pages/vendor/AnalyticsPage'
import { QRCodePage }       from './pages/vendor/QRCodePage'
import { SettingsPage }     from './pages/vendor/SettingsPage'
import { BillingPage }      from './pages/vendor/BillingPage'

// Customer pages (public, no auth)
import { OptInPage }          from './pages/customer/OptInPage'
import { PublicSchedulePage } from './pages/customer/PublicSchedulePage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public customer-facing routes — no auth, light theme */}
          <Route path="/join/:slug" element={<OptInPage />} />

          {/* Auth routes — redirect to dashboard if already logged in */}
          <Route element={<PublicOnlyRoute />}>
            <Route path="/signup"          element={<SignupPage />} />
            <Route path="/login"           element={<LoginPage />} />
            <Route path="/forgot-password"  element={<ForgotPasswordPage />} />
            <Route path="/reset-password"   element={<ResetPasswordPage />} />
          </Route>

          {/* Protected vendor routes */}
          <Route element={<ProtectedRoute />}>
            {/* Onboarding lives outside AppLayout (no sidebar) */}
            <Route path="/onboarding" element={<OnboardingPage />} />

            {/* All other vendor pages are inside the sidebar shell */}
            <Route element={<AppLayout />}>
              <Route path="/dashboard"   element={<DashboardPage />} />
              <Route path="/locations"   element={<LocationsPage />} />
              <Route path="/inbox"       element={<InboxPage />} />
              <Route path="/subscribers" element={<SubscribersPage />} />
              <Route path="/analytics"   element={<AnalyticsPage />} />
              <Route path="/qr-code"     element={<QRCodePage />} />
              <Route path="/settings"    element={<SettingsPage />} />
              <Route path="/billing"     element={<BillingPage />} />
            </Route>
          </Route>

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* Public vendor schedule page — must be last to avoid catching /login etc */}
          <Route path="/:slug" element={<PublicSchedulePage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
