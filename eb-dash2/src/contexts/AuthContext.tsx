/* eslint-disable react-refresh/only-export-components -- arquivo exporta Provider+hook/variantes por padrão de projeto */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  sendOtp: (email: string) => Promise<{ error: string | null }>
  verifyOtp: (email: string, token: string) => Promise<{ error: string | null }>
  sendPasswordReset: (email: string) => Promise<{ error: string | null }>
  updatePassword: (password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  const sendOtp = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    })
    if (error) {
      if (error.status === 422 || error.message.toLowerCase().includes('not found')) {
        return { error: 'Email não encontrado. Verifique o endereço informado.' }
      }
      if (error.status === 429) {
        return { error: 'Muitas solicitações. Aguarde alguns minutos e tente novamente.' }
      }
      return { error: 'Erro ao enviar código. Tente novamente.' }
    }
    return { error: null }
  }

  const verifyOtp = async (email: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    if (error) {
      if (error.message.toLowerCase().includes('expired')) {
        return { error: 'Código expirado. Solicite um novo código.' }
      }
      if (error.message.toLowerCase().includes('invalid')) {
        return { error: 'Código inválido. Verifique e tente novamente.' }
      }
      return { error: 'Erro ao verificar código. Tente novamente.' }
    }
    return { error: null }
  }

  const sendPasswordReset = async (email: string) => {
    const redirectTo = `https://ceo.omnx.pro/reset-password`
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    // Don't reveal if email exists — always return success
    if (error && error.status !== 404) {
      return { error: 'Erro ao enviar email. Tente novamente.' }
    }
    return { error: null }
  }

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      if (error.message.toLowerCase().includes('same')) {
        return { error: 'A nova senha deve ser diferente da senha atual.' }
      }
      return { error: 'Erro ao atualizar senha. Tente novamente.' }
    }
    return { error: null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{ user, session, loading, signIn, sendOtp, verifyOtp, sendPasswordReset, updatePassword, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
