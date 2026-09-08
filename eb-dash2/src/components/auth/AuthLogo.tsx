import { OmnxMark } from '@/components/brand/OmnxMark'

interface AuthLogoProps {
  className?: string
}

export function AuthLogo({ className }: AuthLogoProps) {
  return (
    <div className={className}>
      <div className="flex justify-center">
        <OmnxMark className="h-11 max-w-[15rem] sm:h-12" />
      </div>
    </div>
  )
}
