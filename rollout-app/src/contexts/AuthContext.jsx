import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = loading
  const [vendor, setVendor] = useState(null)

  useEffect(() => {
    // Get current session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchVendor(session.user.id)
    })

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session)
        if (session) {
          await fetchVendor(session.user.id)
        } else {
          setVendor(null)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function fetchVendor(userId) {
    const { data } = await supabase
      .from('vendors')
      .select('*')
      .eq('user_id', userId)
      .single()
    setVendor(data)
  }

  async function signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password })
    return { data, error }
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    return { data, error }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function resetPassword(email) {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${import.meta.env.VITE_APP_URL}/reset-password`,
    })
    return { data, error }
  }

  // Refresh vendor data (used after onboarding updates)
  async function refreshVendor() {
    if (session) await fetchVendor(session.user.id)
  }

  const value = {
    session,
    user: session?.user ?? null,
    vendor,
    loading: session === undefined,
    signUp,
    signIn,
    signOut,
    resetPassword,
    refreshVendor,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
