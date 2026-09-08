import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AuthShell } from '@/components/auth/AuthShell'
import { ArrowLeft, CheckCircle, Loader2, Mail, Clock } from 'lucide-react'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const { sendPasswordReset } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await sendPasswordReset(email)
    if (error) {
      setError(error)
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  if (sent) {
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
              <h2 className="font-display text-2xl font-semibold text-empire-void">Email enviado</h2>
              <p className="text-sm text-empire-muted">
                Se o endereço <span className="font-semibold text-empire-void">{email}</span> estiver
                cadastrado, você receberá um link de recuperação em breve.
              </p>
            </div>
            <div className="space-y-2 rounded-lg border border-empire-border bg-empire-elevated p-4 text-left text-xs text-empire-muted">
              <p className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 shrink-0 text-empire-primary" />
                Verifique também a pasta de spam
              </p>
              <p className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 shrink-0 text-empire-primary" />
                O link expira em 1 hora
              </p>
            </div>
            <Link to="/login">
              <Button variant="gold" className="w-full">
                Voltar para o login
              </Button>
            </Link>
          </CardContent>
        </Card>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <Card variant="glowing" className="overflow-hidden">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-empire-primary/20 bg-empire-primary/10">
              <Mail className="h-8 w-8 text-empire-primary" />
            </div>
          </div>
          <div className="space-y-1.5">
            <CardTitle>Recuperar senha</CardTitle>
            <CardDescription>
              Insira seu email para receber um link de recuperação
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {error && (
            <div className="rounded-lg border border-empire-danger/20 bg-empire-danger-soft p-3 text-sm text-empire-danger">
              <div className="flex items-center gap-2">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                autoComplete="email"
              />
            </div>

            <Button
              type="submit"
              variant="gold"
              size="lg"
              className="w-full"
              disabled={loading || !email}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar link de recuperação
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
