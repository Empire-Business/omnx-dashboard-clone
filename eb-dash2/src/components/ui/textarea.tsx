import { cn } from '@/lib/utils'
import { forwardRef, type TextareaHTMLAttributes } from 'react'

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          'flex min-h-[80px] w-full px-4 py-2 text-base font-body',
          'bg-empire-surface text-empire-void placeholder:text-empire-subtle',
          'border border-empire-border rounded-md',
          'focus:outline-none focus-visible:border-empire-primary focus-visible:ring-2 focus-visible:ring-empire-primary/20',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'resize-y transition-all duration-200',
          className
        )}
        {...props}
      />
    )
  }
)

export { Textarea }
