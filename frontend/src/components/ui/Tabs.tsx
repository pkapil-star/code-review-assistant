/** An accessible tab strip: arrow keys move between tabs, as the WAI-ARIA pattern expects. */

import { useRef, type KeyboardEvent } from 'react'
import type { IconComponent } from './icons'
import { cn } from '@/lib/cn'

export interface TabItem<T extends string> {
  id: T
  label: string
  icon?: IconComponent
  count?: number
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
  size = 'md',
}: {
  items: TabItem<T>[]
  value: T
  onChange: (id: T) => void
  className?: string
  size?: 'sm' | 'md'
}) {
  const listRef = useRef<HTMLDivElement>(null)

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return

    event.preventDefault()
    const index = items.findIndex((item) => item.id === value)
    const next = event.key === 'ArrowRight' ? index + 1 : index - 1
    const target = items[(next + items.length) % items.length]

    onChange(target.id)
    listRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${target.id}"]`)?.focus()
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      onKeyDown={handleKeyDown}
      className={cn('flex items-center gap-1 overflow-x-auto border-b border-line', className)}
    >
      {items.map((item) => {
        const active = item.id === value
        const Icon = item.icon

        return (
          <button
            key={item.id}
            data-tab={item.id}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cn(
              'relative flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 font-semibold transition-colors',
              size === 'sm' ? 'px-3 py-2.5 text-sm' : 'px-4 py-3 text-sm',
              active
                ? 'border-accent text-ink'
                : 'border-transparent text-ink-muted hover:border-line-strong hover:text-ink-soft',
            )}
          >
            {Icon && <Icon className="h-4 w-4" aria-hidden />}
            {item.label}
            {item.count !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 font-mono text-xs tabular-nums',
                  active ? 'bg-accent/15 text-accent' : 'bg-raised text-ink-muted',
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
