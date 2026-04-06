import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, CheckCircle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

export function ForgotPasswordPage() {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState('')

  const { resetPassword } = useAuth()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await resetPassword(email)
    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    setSent(true)
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
        {sent ? (
          /* Success state */
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-12 h-12 rounded-full bg-success-muted flex items-center justify-center">
              <CheckCircle size={24} className="text-success" />
            </div>
            <h1 className="font-display font-bold text-2xl text-text-primary">
              Check your email
            </h1>
            <p className="text-text-secondary text-sm leading-relaxed">
              We sent a password reset link to{' '}
              <span className="text-text-primary font-medium">{email}</span>.
              <br />
              Check your inbox and follow the link.
            </p>
            <Link
              to="/login"
              className="text-text-secondary text-sm hover:text-text-primary underline underline-offset-2 transition-colors mt-2"
            >
              Back to login
            </Link>
          </div>
        ) : (
          /* Form state */
          <>
            <h1 className="font-display font-bold text-3xl text-accent text-center mb-1">
              Reset password
            </h1>
            <p className="text-text-secondary text-sm text-center mb-6">
              Enter your email and we'll send you a reset link
            </p>

            {error && (
              <p className="text-accent text-sm text-center mb-4">{error}</p>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full bg-surface-raised border border-border rounded-lg px-3.5 py-2.5 text-text-primary text-sm font-body placeholder-text-tertiary focus:outline-none focus:border-accent transition-colors"
              />

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-accent hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed text-bg font-body font-medium text-sm rounded-lg py-2.5 flex items-center justify-center gap-2 transition-colors"
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                Send Reset Link
              </button>
            </form>

            <p className="text-text-secondary text-xs text-center mt-5">
              Remember your password?{' '}
              <Link
                to="/login"
                className="text-text-primary hover:text-accent underline underline-offset-2 transition-colors"
              >
                Log in
              </Link>
            </p>
          </>
        )}
      </div>

      <div className="fixed bottom-6 right-6 text-text-tertiary text-2xl select-none pointer-events-none">
        ✦
      </div>
    </div>
  )
}
