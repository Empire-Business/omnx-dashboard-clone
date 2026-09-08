import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'

interface CheckboxProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'onChange'> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

function Checkbox({ checked, onCheckedChange, disabled, className, id, ...props }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      id={id}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange?.(!checked)}
      className={cn(
        'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm transition-colors duration-150',
        checked
          ? 'border-[1.5px] border-empire-primary bg-empire-primary text-empire-primary-foreground'
          : 'border-[1.5px] border-empire-border bg-transparent',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
      {...props}
    >
      {checked && <Check className="h-3 w-3 stroke-[3]" />}
    </button>
  )
}

export { Checkbox }
