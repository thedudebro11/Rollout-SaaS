import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export function ResetPasswordPage() {
  const [password, setPassword]     = useState('')
  const [confirm, setConfirm]       = useState('')
  const [showPass, setShowPass]     = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading]       = useState(false)
  const [done, setDone]             = useState(false)
  const [error, setError]           = useState('')
  const [validSession, setValidSession] = useState(false)

  const navigate = useNavigate()

  useEffect(() => {
    // Supabase fires onAuthStateChange with event PASSWORD_RECOVERY
    // when the user lands here from the reset email link
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setValidSession(true)
      }
    })

    // Also check if there's already an active session (user arrived via link)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setValidSession(true)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    setDone(true)
    setTimeout(() => navigate('/dashboard'), 2500)
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <div className="flex flex-col items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-accent" />
        <span className="font-display font-bold text-2xl text-text-primary tracking-tight">
          Rollout
        </span>
      </div>

      <div className="w-full max-w-sm">
        {done ? (
          /* Success state */
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-12 h-12 rounded-full bg-success-muted flex items-center justify-center">
              <CheckCircle size={24} className="text-success" />
            </div>
            <h1 className="font-display font-bold text-2xl text-text-primary">
              Password updated
            </h1>
            <p className="text-text-secondary text-sm">
              Redirecting you to your dashboard…
            </p>
          </div>
        ) : !validSession ? (
          /* Invalid / expired link */
          <div className="flex flex-col items-center gap-4 text-center">
            <h1 className="font-display font-bold text-2xl text-text-primary">
              Link expired
            </h1>
            <p className="text-text-secondary text-sm leading-relaxed">
              This reset link is no longer valid.
              <br />
              Request a new one below.
            </p>
            <Link
              to="/forgot-password"
              className="bg-accent hover:bg-accent-hover text-bg font-body font-medium text-sm rounded-lg px-5 py-2.5 transition-colors"
            >
              Request new link
            </Link>
          </div>
        ) : (
          /* Form state */
          <>
            <h1 className="font-display font-bold text-3xl text-accent text-center mb-1">
              New password
            </h1>
            <p className="text-text-secondary text-sm text-center mb-6">
              Choose a strong password for your account
            </p>

            {error && (
              <p className="text-accent text-sm text-center mb-4">{error}</p>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="New password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="w-full bg-surface-raised border border-border rounded-lg px-3.5 py-2.5 pr-10 text-text-primary text-sm font-body placeholder-text-tertiary focus:outline-none focus:border-accent transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Confirm new password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="w-full bg-surface-raised border border-border rounded-lg px-3.5 py-2.5 pr-10 text-text-primary text-sm font-body placeholder-text-tertiary focus:outline-none focus:border-accent transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-accent hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed text-bg font-body font-medium text-sm rounded-lg py-2.5 flex items-center justify-center gap-2 transition-colors mt-1"
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                Update Password
              </button>
            </form>
          </>
        )}
      </div>

      <div className="fixed bottom-6 right-6 text-text-tertiary text-2xl select-none pointer-events-none">
        ✦
      </div>
    </div>
  )
}
