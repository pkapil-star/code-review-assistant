/**
 * The pipeline diagram.
 *
 * Drawn with layout and borders rather than an image, so it stays sharp on a
 * projector, respects the theme, and reflows to a vertical list on a phone.
 * It is the single clearest statement of what the product does, so it appears
 * on the landing page and again in the documentation.
 */

import {
  ArrowDown,
  ArrowRight,
  Bot,
  FileCheck2,
  GitPullRequest,
  MessagesSquare,
  ScanLine,
  Webhook,
} from 'lucide-react'
import type { IconComponent } from '@/components/ui/icons'
import { cn } from '@/lib/cn'

interface Stage {
  icon: IconComponent
  title: string
  detail: string
  tone: 'neutral' | 'accent' | 'success'
}

export const STAGES: Stage[] = [
  {
    icon: GitPullRequest,
    title: 'Pull request',
    detail: 'Opened, reopened, or pushed to on a connected repository.',
    tone: 'neutral',
  },
  {
    icon: Webhook,
    title: 'Webhook verified',
    detail: 'HMAC-SHA256 signature checked before the body is parsed.',
    tone: 'neutral',
  },
  {
    icon: ScanLine,
    title: 'Static analysis',
    detail: 'Diff rules and Python syntax-tree rules, on the added lines only.',
    tone: 'accent',
  },
  {
    icon: Bot,
    title: 'AI review',
    detail: 'The model reads the same diff for what a rule cannot express.',
    tone: 'accent',
  },
  {
    icon: FileCheck2,
    title: 'Merged report',
    detail: 'Findings deduplicated, sorted worst-first, and capped.',
    tone: 'success',
  },
  {
    icon: MessagesSquare,
    title: 'Inline feedback',
    detail: 'One review posted to the pull request, anchored to the lines.',
    tone: 'success',
  },
]

const TONE: Record<Stage['tone'], string> = {
  neutral: 'border-line-strong bg-raised text-ink-muted',
  accent: 'border-accent/40 bg-accent/12 text-accent',
  success: 'border-success/40 bg-success/12 text-success',
}

export function PipelineDiagram({ compact = false }: { compact?: boolean }) {
  return (
    <ol className="grid gap-3 lg:grid-cols-[repeat(6,minmax(0,1fr))] lg:gap-0">
      {STAGES.map((stage, index) => (
        <li key={stage.title} className="relative">
          <div
            className={cn(
              'flex h-full flex-col rounded-lg border border-line bg-surface p-4 lg:mx-1.5',
              compact ? 'lg:p-4' : 'lg:p-5',
            )}
          >
            <span
              className={cn(
                'mb-3 flex h-10 w-10 items-center justify-center rounded-md border',
                TONE[stage.tone],
              )}
            >
              <stage.icon className="h-5 w-5" aria-hidden />
            </span>

            <p className="font-mono text-xs text-ink-muted">
              {String(index + 1).padStart(2, '0')}
            </p>
            <h3 className={cn('mt-0.5 font-semibold text-ink', compact ? 'text-sm' : 'text-base')}>
              {stage.title}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{stage.detail}</p>
          </div>

          {index < STAGES.length - 1 && (
            <>
              <ArrowRight
                className="absolute -right-2 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 text-line-strong lg:block"
                aria-hidden
              />
              <ArrowDown
                className="mx-auto mt-2 h-4 w-4 text-line-strong lg:hidden"
                aria-hidden
              />
            </>
          )}
        </li>
      ))}
    </ol>
  )
}
