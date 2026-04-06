import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

export function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const { signIn } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await signIn(email, password)
    setLoading(false)

    if (error) {
      // Match the mockup error text exactly
      setError('Incorrect email or password')
      return
    }

    navigate('/dashboard')
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
        <h1 className="font-display font-bold text-3xl text-accent text-center mb-1">
          Welcome back
        </h1>
        <p className="text-text-secondary text-sm text-center mb-6">
          No credit card required
        </p>

        {/* Error message — sits between subtitle and inputs, accent color */}
        {error && (
          <p className="text-accent text-sm text-center mb-4">{error}</p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Email */}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full bg-surface-raised border border-border rounded-lg px-3.5 py-2.5 text-text-primary text-sm font-body placeholder-text-tertiary focus:outline-none focus:border-accent transition-colors"
          />

          {/* Password */}
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
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

          {/* Forgot password — right aligned */}
          <div className="flex justify-end -mt-1">
            <Link
              to="/forgot-password"
              className="text-text-secondary text-xs hover:text-text-primary underline underline-offset-2 transition-colors"
            >
              Forgot password?
            </Link>
          </div>

          {/* CTA */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed text-bg font-body font-medium text-sm rounded-lg py-2.5 flex items-center justify-center gap-2 transition-colors"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            Log In
          </button>
        </form>

        <p className="text-text-secondary text-xs text-center mt-5">
          Don't have an account?{' '}
          <Link to="/signup" className="text-text-primary hover:text-accent font-medium underline underline-offset-2 transition-colors">
            Start free trial
          </Link>
        </p>
      </div>

      {/* Decorative sparkle */}
      <div className="fixed bottom-6 right-6 text-text-tertiary text-2xl select-none pointer-events-none">
        ✦
      </div>
    </div>
  )
}
