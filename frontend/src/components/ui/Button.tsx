import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Link } from 'react-router-dom'
import type { IconComponent } from './icons'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-accent-ink border-transparent hover:brightness-110 active:brightness-95',
  secondary:
    'bg-raised text-ink border-line-strong hover:bg-surface hover:border-ink-muted',
  ghost: 'bg-transparent text-ink-soft border-transparent hover:bg-raised hover:text-ink',
  danger: 'bg-critical text-white border-transparent hover:brightness-110',
  success: 'bg-success text-[rgb(7,22,14)] border-transparent hover:brightness-110',
}

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2.5',
}

const BASE =
  'inline-flex items-center justify-center whitespace-nowrap rounded-md border font-semibold ' +
  'transition-[background-color,border-color,filter,transform] duration-150 ' +
  'disabled:pointer-events-none disabled:opacity-45 active:translate-y-px'

interface CommonProps {
  variant?: Variant
  size?: Size
  icon?: IconComponent
  iconRight?: IconComponent
  className?: string
}

export interface ButtonProps
  extends CommonProps,
    ButtonHTMLAttributes<HTMLButtonElement> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, iconRight: IconRight, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...props}
    >
      {Icon && <Icon className={size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} aria-hidden />}
      {children}
      {IconRight && <IconRight className={size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} aria-hidden />}
    </button>
  )
})

/** The same treatment applied to an internal route link. */
export function ButtonLink({
  to,
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  className,
  children,
}: CommonProps & { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className={cn(BASE, VARIANTS[variant], SIZES[size], className)}>
      {Icon && <Icon className={size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} aria-hidden />}
      {children}
      {IconRight && <IconRight className={size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} aria-hidden />}
    </Link>
  )
}

/** And to an external link, which always opens in a new tab. */
export function ButtonAnchor({
  href,
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  className,
  children,
}: CommonProps & { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
    >
      {Icon && <Icon className={size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} aria-hidden />}
      {children}
      {IconRight && <IconRight className={size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} aria-hidden />}
    </a>
  )
}
