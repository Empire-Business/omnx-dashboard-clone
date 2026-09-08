import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AuthShell } from '@/components/auth/AuthShell'
import { ArrowLeft, CheckCircle, Loader2, ShieldCheck, Eye, EyeOff, AlertCircle } from 'lucide-react'

type PageState = 'checking' | 'ready' | 'invalid' | 'success'

export function ResetPasswordPage() {
  const [pageState, setPageState] = useState<PageState>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { updatePassword, signOut } = useAuth()

  useEffect(() => {
    // Supabase will emit PASSWORD_RECOVERY or SIGNED_IN after clicking the link
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPageState('ready')
      } else if (event === 'SIGNED_IN' && session) {
        // May arrive before PASSWORD_RECOVERY on some flows
        setPageState('ready')
      }
    })

    // Also check current session for direct page loads with valid token
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setPageState('ready')
      } else {
        // No immediate session — give Supabase time to process the hash token
        const timeout = setTimeout(() => {
          setPageState((prev) => (prev === 'checking' ? 'invalid' : prev))
        }, 2500)
        return () => clearTimeout(timeout)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres')
      return
    }
    if (password !== confirm) {
      setError('As senhas não correspondem')
      return
    }

    setLoading(true)
    const { error } = await updatePassword(password)

    if (error) {
      setError(error)
      setLoading(false)
      return
    }

    setPageState('success')
    setLoading(false)
    await signOut()
  }

  if (pageState === 'checking') {
    return (
      <AuthShell>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-empire-primary" />
          <p className="text-sm text-empire-muted">Verificando link...</p>
        </div>
      </AuthShell>
    )
  }

  if (pageState === 'invalid') {
    return (
      <AuthShell>
        <Card variant="glowing" className="overflow-hidden">
          <CardContent className="space-y-6 pb-8 pt-12 text-center">
            <div className="space-y-2">
              <h2 className="font-display text-2xl font-semibold text-empire-void">Link inválido</h2>
              <p className="text-sm text-empire-muted">
                O link de recuperação é inválido ou expirou. Solicite um novo link.
              </p>
            </div>
            <Link to="/forgot-password">
              <Button variant="gold" className="w-full">
                Solicitar novo link
              </Button>
            </Link>
          </CardContent>
        </Card>
      </AuthShell>
    )
  }

  if (pageState === 'success') {
    return (
      <AuthShell>
        <Card variant="glowing" className="overflow-hidden">
          <CardContent className="space-y-6 pb-8 pt-12 text-center">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-empire-success/30 bg-empire-success-soft">
                <CheckCircle className="h-8 w-8 text-empire-success" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="font-display text-2xl font-semibold text-empire-void">Senha atualizada</h2>
              <p className="text-sm text-empire-muted">
                Sua senha foi atualizada com sucesso. Faça login com a nova senha.
              </p>
            </div>
            <Link to="/login">
              <Button variant="gold" className="w-full">
                Ir para o login
              </Button>
            </Link>
          </CardContent>
        </Card>
      </AuthShell>
    )
  }

  const passwordsMatch = confirm.length === 0 || password === confirm

  return (
    <AuthShell>
      <Card variant="glowing" className="overflow-hidden">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-empire-primary/20 bg-empire-primary/10">
              <ShieldCheck className="h-8 w-8 text-empire-primary" />
            </div>
          </div>
          <div className="space-y-1.5">
            <CardTitle>Nova senha</CardTitle>
            <CardDescription>Digite sua nova senha de acesso</CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {error && (
            <div className="rounded-lg border border-empire-danger/20 bg-empire-danger-soft p-3 text-sm text-empire-danger">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Nova senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Mínimo 8 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-empire-subtle transition-colors hover:text-empire-void"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {password.length > 0 && password.length < 8 && (
                <p className="text-xs text-empire-subtle">
                  {8 - password.length} caracteres restantes
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm">Confirmar senha</Label>
              <Input
                id="confirm"
                type="password"
                placeholder="Repita a nova senha"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                disabled={loading}
              />
              {!passwordsMatch && (
                <p className="text-xs text-empire-danger">As senhas não correspondem</p>
              )}
            </div>

            <Button
              type="submit"
              variant="gold"
              size="lg"
              className="w-full"
              disabled={loading || !password || !confirm || !passwordsMatch || password.length < 8}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Atualizar senha
            </Button>
          </form>

          <Link
            to="/login"
            className="flex items-center justify-center gap-2 text-xs text-empire-subtle transition-colors duration-200 hover:text-empire-void"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar para o login
          </Link>
        </CardContent>
      </Card>
    </AuthShell>
  )
}
