/** A dialog that closes on Escape and on a click outside, and restores focus on the way out. */

import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  footer?: ReactNode
  children?: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    restoreTo.current = document.activeElement as HTMLElement | null
    panelRef.current?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      restoreTo.current?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[rgb(2_6_16/0.72)] p-4 animate-fade-in"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-lg animate-fade-up rounded-xl border border-line bg-surface shadow-lifted focus:outline-none"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
            {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded p-1.5 text-ink-muted transition-colors hover:bg-raised hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        {children && <div className="px-5 py-4 text-sm leading-relaxed text-ink-soft">{children}</div>}

        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2.5 border-t border-line px-5 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
