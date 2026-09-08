import { cn } from '@/lib/utils'
import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react'

function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div
      className="w-full overflow-x-auto rounded-lg border border-empire-border"
    >
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  )
}

function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn('sticky top-0 z-10 [&_tr]:border-b bg-empire-elevated', className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      className={cn('[&_tr:last-child]:border-0 bg-empire-surface', className)}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        'transition-colors duration-200 border-b border-empire-border hover:bg-empire-hover data-[state=selected]:bg-empire-hover',
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'px-6 py-3 text-left align-middle font-mono text-[11px] uppercase tracking-widest text-empire-muted font-medium',
        '[&:has([role=checkbox])]:pr-0',
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn('px-6 py-4 align-middle text-empire-void [&:has([role=checkbox])]:pr-0', className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tfoot
      className={cn('font-medium border-t border-empire-border bg-empire-elevated [&>tr]:last:border-b-0', className)}
      {...props}
    />
  )
}

export { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell }
