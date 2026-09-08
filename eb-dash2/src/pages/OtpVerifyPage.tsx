import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AuthShell } from '@/components/auth/AuthShell'
import { ArrowLeft, Loader2, MailCheck, RefreshCw, KeyRound, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const OTP_LENGTH = 8
const RESEND_COOLDOWN = 60 // seconds

export function OtpVerifyPage() {
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(RESEND_COOLDOWN)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const { verifyOtp, sendOtp } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') ?? ''
  const redirect = searchParams.get('redirect') ?? '/traqueamento'

  // Focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  const token = digits.join('')
  const isComplete = token.length === OTP_LENGTH && digits.every((d) => d !== '')

  const handleDigitChange = (index: number, value: string) => {
    // Handle paste
    if (value.length > 1) {
      const pasted = value.replace(/\D/g, '').slice(0, OTP_LENGTH)
      const newDigits = [...digits]
      for (let i = 0; i < pasted.length; i++) {
        if (index + i < OTP_LENGTH) newDigits[index + i] = pasted[i]
      }
      setDigits(newDigits)
      const nextIndex = Math.min(index + pasted.length, OTP_LENGTH - 1)
      inputRefs.current[nextIndex]?.focus()
      return
    }

    const digit = value.replace(/\D/g, '').slice(-1)
    const newDigits = [...digits]
    newDigits[index] = digit
    setDigits(newDigits)
    setError(null)

    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        const newDigits = [...digits]
        newDigits[index - 1] = ''
        setDigits(newDigits)
        inputRefs.current[index - 1]?.focus()
      } else {
        const newDigits = [...digits]
        newDigits[index] = ''
        setDigits(newDigits)
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleVerify = async () => {
    if (!isComplete) return
    setLoading(true)
    setError(null)

    const { error } = await verifyOtp(email, token)
    if (error) {
      setError(error)
      setDigits(Array(OTP_LENGTH).fill(''))
      inputRefs.current[0]?.focus()
      setLoading(false)
      return
    }

    navigate(redirect, { replace: true })
  }

  const handleResend = async () => {
    setResending(true)
    setError(null)
    setDigits(Array(OTP_LENGTH).fill(''))
    inputRefs.current[0]?.focus()

    const { error } = await sendOtp(email)
    if (error) {
      setError(error)
    } else {
      setCountdown(RESEND_COOLDOWN)
    }
    setResending(false)
  }

  return (
    <AuthShell>
      <Card variant="glowing" className="overflow-hidden">
        <CardHeader className="space-y-5 text-center">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-empire-primary/20 bg-empire-primary/10">
              <KeyRound className="h-8 w-8 text-empire-primary" />
            </div>
          </div>
          <div className="space-y-2">
            <CardTitle>Verificar código</CardTitle>
            <CardDescription className="space-y-1">
              <span className="block">Código enviado para</span>
              <span className="block font-semibold text-empire-void">{email}</span>
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {error && (
            <div className="rounded-lg border border-empire-danger/20 bg-empire-danger-soft p-3 text-sm text-empire-danger">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            </div>
          )}

          {/* OTP digit inputs */}
          <div className="flex justify-center gap-2">
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onFocus={(e) => e.target.select()}
                disabled={loading}
                className={cn(
                  'h-12 w-10 rounded-lg border bg-empire-surface text-center text-lg font-bold text-empire-void caret-empire-primary',
                  'transition-all duration-200 outline-none focus:border-empire-primary focus:ring-2 focus:ring-empire-primary/30',
                  'disabled:opacity-50',
                  digit ? 'border-empire-primary/60' : 'border-empire-border-strong'
                )}
              />
            ))}
          </div>

          {/* Separator hint */}
          <div className="flex items-center justify-center gap-1.5 text-xs text-empire-subtle">
            <span className="font-mono">{digits.slice(0, 4).join('') || '••••'}</span>
            <span>–</span>
            <span className="font-mono">{digits.slice(4).join('') || '••••'}</span>
          </div>

          <Button
            onClick={handleVerify}
            variant="gold"
            size="lg"
            className="w-full"
            disabled={!isComplete || loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verificando...
              </>
            ) : (
              <>
                <MailCheck className="mr-2 h-4 w-4" />
                Verificar código
              </>
            )}
          </Button>

          {/* Resend */}
          <div className="text-center">
            {countdown > 0 ? (
              <p className="text-xs text-empire-subtle">
                Reenviar em{' '}
                <span className="font-mono text-empire-void">
                  {String(Math.floor(countdown / 60)).padStart(2, '0')}:
                  {String(countdown % 60).padStart(2, '0')}
                </span>
              </p>
            ) : (
              <button
                onClick={handleResend}
                disabled={resending}
                className="mx-auto flex items-center justify-center gap-1.5 text-xs text-empire-subtle transition-colors duration-200 hover:text-empire-primary disabled:opacity-50"
              >
                {resending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Reenviar código
              </button>
            )}
          </div>

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
