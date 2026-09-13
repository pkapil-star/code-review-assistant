/** Form controls: search, select and toggle, each labelled for screen readers. */

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/cn'

const FIELD =
  'h-10 w-full rounded-md border border-line bg-sunken px-3 text-sm text-ink placeholder:text-ink-muted ' +
  'transition-colors hover:border-line-strong focus:border-accent focus:outline-none'

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
  label = 'Search',
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  className?: string
}) {
  const id = useId()

  return (
    <div className={cn('relative', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
        aria-hidden
      />
      <input
        id={id}
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={cn(FIELD, 'pl-9 pr-9')}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-muted transition-colors hover:bg-raised hover:text-ink"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </div>
  )
}

export function Select({
  label,
  hideLabel = false,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hideLabel?: boolean }) {
  const id = useId()

  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'label-caps mb-1.5 block'}>
        {label}
      </label>
      <select id={id} className={cn(FIELD, 'cursor-pointer pr-8')} {...props}>
        {children}
      </select>
    </div>
  )
}

export function TextField({
  label,
  hint,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId()

  return (
    <div className={className}>
      <label htmlFor={id} className="label-caps mb-1.5 block">
        {label}
      </label>
      <input id={id} className={FIELD} {...props} />
      {hint && <p className="mt-1.5 text-xs text-ink-muted">{hint}</p>}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  disabledReason,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
  disabledReason?: string
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{label}</p>
        {description && <p className="mt-1 text-sm leading-relaxed text-ink-muted">{description}</p>}
        {disabled && disabledReason && (
          <p className="mt-1.5 font-mono text-xs text-warning">{disabledReason}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors',
          checked ? 'border-accent bg-accent' : 'border-line-strong bg-sunken',
          disabled && 'cursor-not-allowed opacity-45',
        )}
      >
        <span className="sr-only">{typeof label === 'string' ? label : 'Toggle'}</span>
        <span
          className={cn(
            'absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-[left] duration-200',
            checked ? 'left-[1.5rem] bg-accent-ink' : 'left-1 bg-ink-muted',
          )}
        />
      </button>
    </div>
  )
}

/** A read-only row for configuration the UI shows but must not let a browser change. */
export function ReadOnlyRow({
  label,
  value,
  hint,
}: {
  label: string
  value: ReactNode
  hint?: string
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{label}</p>
        {hint && <p className="mt-1 text-sm text-ink-muted">{hint}</p>}
      </div>
      <span className="font-mono text-sm text-ink-soft">{value}</span>
    </div>
  )
}
