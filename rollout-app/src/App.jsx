import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute, PublicOnlyRoute } from './components/ProtectedRoute'
import { AppLayout } from './layouts/AppLayout'

// Helper: unwrap named export for React.lazy (which requires a default export)
const lazyNamed = (importer, name) =>
  lazy(() => importer().then(m => ({ default: m[name] })))

const LandingPage        = lazyNamed(() => import('./pages/LandingPage'),                   'LandingPage')
const SignupPage         = lazyNamed(() => import('./pages/auth/SignupPage'),               'SignupPage')
const LoginPage          = lazyNamed(() => import('./pages/auth/LoginPage'),                'LoginPage')
const ForgotPasswordPage = lazyNamed(() => import('./pages/auth/ForgotPasswordPage'),      'ForgotPasswordPage')
const ResetPasswordPage  = lazyNamed(() => import('./pages/auth/ResetPasswordPage'),       'ResetPasswordPage')
const OnboardingPage     = lazyNamed(() => import('./pages/vendor/OnboardingPage'),         'OnboardingPage')
const DashboardPage      = lazyNamed(() => import('./pages/vendor/DashboardPage'),          'DashboardPage')
const LocationsPage      = lazyNamed(() => import('./pages/vendor/LocationsPage'),          'LocationsPage')
const InboxPage          = lazyNamed(() => import('./pages/vendor/InboxPage'),              'InboxPage')
const SubscribersPage    = lazyNamed(() => import('./pages/vendor/SubscribersPage'),        'SubscribersPage')
const AnalyticsPage      = lazyNamed(() => import('./pages/vendor/AnalyticsPage'),          'AnalyticsPage')
const QRCodePage         = lazyNamed(() => import('./pages/vendor/QRCodePage'),             'QRCodePage')
const SettingsPage       = lazyNamed(() => import('./pages/vendor/SettingsPage'),           'SettingsPage')
const BillingPage        = lazyNamed(() => import('./pages/vendor/BillingPage'),            'BillingPage')
const OptInPage          = lazyNamed(() => import('./pages/customer/OptInPage'),            'OptInPage')
const PublicSchedulePage = lazyNamed(() => import('./pages/customer/PublicSchedulePage'),   'PublicSchedulePage')

// Minimal dark fallback shown while a lazy chunk loads (matches app background)
function PageFallback() {
  return <div style={{ minHeight: '100vh', background: '#0a0a0a' }} />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageFallback />}>
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

          {/* Landing page */}
          <Route path="/" element={<LandingPage />} />

          {/* Public vendor schedule page — must be last to avoid catching /login etc */}
          <Route path="/:slug" element={<PublicSchedulePage />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}
