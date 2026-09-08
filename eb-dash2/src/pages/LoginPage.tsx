import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { AuthShell } from '@/components/auth/AuthShell'
import { AuthLogo } from '@/components/auth/AuthLogo'
import { Loader2, Lock, KeyRound, Mail, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

type LoginMethod = 'password' | 'otp'

export function LoginPage() {
  const [method, setMethod] = useState<LoginMethod>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { signIn, sendOtp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/'

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await signIn(email, password)
    if (error) {
      setError(
        error.includes('Invalid login credentials')
          ? 'Email ou senha incorretos'
          : error
      )
      setLoading(false)
      return
    }

    navigate(from, { replace: true })
  }

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await sendOtp(email)
    if (error) {
      setError(error)
      setLoading(false)
      return
    }

    navigate(`/verify-otp?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(from)}`)
  }

  const changeMethod = (m: LoginMethod) => {
    setMethod(m)
    setError(null)
  }

  return (
    <AuthShell>
      <Card variant="glowing" className="overflow-hidden">
        <CardContent className="space-y-6 p-8">
          <AuthLogo />

          {error && (
            <div className="rounded-lg border border-empire-danger/20 bg-empire-danger-soft p-4 text-sm text-empire-danger">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            </div>
          )}

          {/* Method toggle */}
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-empire-border bg-empire-elevated p-1.5">
            <button
              type="button"
              onClick={() => changeMethod('password')}
              className={cn(
                'flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold transition-all duration-200',
                method === 'password'
                  ? 'bg-empire-primary text-empire-primary-foreground shadow-sm'
                  : 'text-empire-muted hover:text-empire-void'
              )}
            >
              <Lock className="h-4 w-4" />
              Senha
            </button>
            <button
              type="button"
              onClick={() => changeMethod('otp')}
              className={cn(
                'flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold transition-all duration-200',
                method === 'otp'
                  ? 'bg-empire-primary text-empire-primary-foreground shadow-sm'
                  : 'text-empire-muted hover:text-empire-void'
              )}
            >
              <KeyRound className="h-4 w-4" />
              OTP
            </button>
          </div>

          {/* Password form */}
          {method === 'password' && (
            <form onSubmit={handlePasswordLogin} className="space-y-4 animate-fade-in">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    aria-pressed={showPassword}
                    title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-empire-subtle transition-colors duration-200 hover:text-empire-primary focus:outline-none focus-visible:text-empire-primary"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" variant="gold" size="lg" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading ? 'Autenticando...' : 'Entrar'}
              </Button>
              <div className="text-center">
                <Link
                  to="/forgot-password"
                  className="text-xs text-empire-subtle transition-colors duration-200 hover:text-empire-primary"
                >
                  Esqueceu a senha?
                </Link>
              </div>
            </form>
          )}

          {/* OTP form */}
          {method === 'otp' && (
            <form onSubmit={handleSendOtp} className="space-y-4 animate-fade-in">
              <div className="space-y-2">
                <Label htmlFor="email-otp">Email</Label>
                <Input
                  id="email-otp"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="rounded-lg border border-empire-primary/10 bg-empire-primary/5 p-3">
                <p className="flex items-start gap-2 text-xs text-empire-muted">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-empire-primary" />
                  <span>
                    Enviaremos um código de 8 dígitos para seu email. Válido por 10 minutos.
                  </span>
                </p>
              </div>
              <Button type="submit" variant="gold" size="lg" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Enviar código
                  </>
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  )
}
