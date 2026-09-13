/**
 * Chart wrappers.
 *
 * Recharts is configured once here so every chart in the product shares the
 * same axes, grid weight, tooltip and palette. The settings are tuned for a
 * projector: thicker strokes, larger tick labels, visible dots, and no legend
 * where the series can be labelled directly.
 */

import type { ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { shortDate } from '@/lib/format'

export const CHART_COLORS = {
  accent: 'rgb(var(--accent))',
  success: 'rgb(var(--success))',
  warning: 'rgb(var(--warning))',
  critical: 'rgb(var(--critical))',
  muted: 'rgb(var(--ink-muted))',
}

const AXIS = {
  stroke: 'rgb(var(--line-strong))',
  tick: { fill: 'rgb(var(--ink-muted))', fontSize: 13, fontFamily: 'JetBrains Mono, monospace' },
}

function ChartTooltip({
  active,
  payload,
  label,
  formatLabel,
}: {
  active?: boolean
  payload?: { name?: string; value?: number | string; color?: string }[]
  label?: string | number
  formatLabel?: (value: string | number) => string
}) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-md border border-line-strong bg-surface px-3 py-2.5 shadow-lifted">
      {label !== undefined && (
        <p className="mb-1.5 font-mono text-xs text-ink-muted">
          {formatLabel ? formatLabel(label) : label}
        </p>
      )}
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center gap-2 text-sm text-ink">
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{ background: entry.color }}
            aria-hidden
          />
          <span className="text-ink-muted">{entry.name}</span>
          <span className="ml-auto font-mono font-semibold tabular-nums">{entry.value ?? '—'}</span>
        </p>
      ))}
    </div>
  )
}

export function ChartFrame({
  height = 280,
  children,
}: {
  height?: number
  children: ReactNode
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  )
}

export interface TrendSeries {
  key: string
  name: string
  color: string
}

/** Review volume and findings over time. */
export function TrendAreaChart({
  data,
  series,
  height = 280,
}: {
  data: Record<string, unknown>[]
  series: TrendSeries[]
  height?: number
}) {
  return (
    <ChartFrame height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <defs>
          {series.map((entry) => (
            <linearGradient key={entry.key} id={`fill-${entry.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={entry.color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={entry.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke="rgb(var(--line))" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(value: string) => shortDate(value)}
          {...AXIS}
          tickLine={false}
          minTickGap={28}
        />
        <YAxis {...AXIS} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
        <Tooltip
          content={<ChartTooltip formatLabel={(value) => shortDate(String(value))} />}
          cursor={{ stroke: 'rgb(var(--line-strong))' }}
        />
        {series.map((entry) => (
          <Area
            key={entry.key}
            type="monotone"
            dataKey={entry.key}
            name={entry.name}
            stroke={entry.color}
            strokeWidth={2.5}
            fill={`url(#fill-${entry.key})`}
          />
        ))}
      </AreaChart>
    </ChartFrame>
  )
}

/** Average score over time, which needs a line rather than a filled area. */
export function ScoreLineChart({
  data,
  height = 280,
}: {
  data: Record<string, unknown>[]
  height?: number
}) {
  return (
    <ChartFrame height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid stroke="rgb(var(--line))" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(value: string) => shortDate(value)}
          {...AXIS}
          tickLine={false}
          minTickGap={28}
        />
        <YAxis {...AXIS} domain={[0, 100]} tickLine={false} axisLine={false} width={44} />
        <Tooltip
          content={<ChartTooltip formatLabel={(value) => shortDate(String(value))} />}
          cursor={{ stroke: 'rgb(var(--line-strong))' }}
        />
        <Line
          type="monotone"
          dataKey="average_score"
          name="Average score"
          stroke={CHART_COLORS.accent}
          strokeWidth={2.75}
          dot={{ r: 3.5, fill: CHART_COLORS.accent, strokeWidth: 0 }}
          activeDot={{ r: 5.5 }}
          connectNulls
        />
      </LineChart>
    </ChartFrame>
  )
}

/**
 * A labelled horizontal bar chart.
 *
 * Categories are read left to right with their names in full, which a pie chart
 * cannot do without a legend that sits too far from the wedges to be read from
 * across a room.
 */
export function CategoryBarChart({
  data,
  color = CHART_COLORS.accent,
  height = 280,
  colorFor,
}: {
  data: { name: string; value: number }[]
  color?: string
  height?: number
  colorFor?: (entry: { name: string; value: number }) => string
}) {
  return (
    <ChartFrame height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
        <CartesianGrid stroke="rgb(var(--line))" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" {...AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={132}
          tick={{ ...AXIS.tick, fontFamily: 'Inter, sans-serif' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgb(var(--raised))' }} />
        <Bar dataKey="value" name="Findings" radius={[0, 4, 4, 0]} barSize={20}>
          {data.map((entry) => (
            <Cell key={entry.name} fill={colorFor ? colorFor(entry) : color} />
          ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  )
}

/**
 * Severity distribution, as a stacked bar with the counts written on it.
 *
 * Three proportions and three numbers, readable without a legend and without
 * relying on the reader telling amber from red at distance.
 */
export function SeverityBreakdown({
  counts,
}: {
  counts: { severity: 'error' | 'warning' | 'info'; count: number }[]
}) {
  const total = counts.reduce((sum, entry) => sum + entry.count, 0)

  const meta = {
    error: { label: 'Critical', color: CHART_COLORS.critical, text: 'text-critical' },
    warning: { label: 'Warning', color: CHART_COLORS.warning, text: 'text-warning' },
    info: { label: 'Suggestion', color: CHART_COLORS.accent, text: 'text-accent' },
  }

  if (total === 0) {
    return <p className="py-8 text-center text-sm text-ink-muted">No findings recorded yet.</p>
  }

  return (
    <div>
      <div className="flex h-4 w-full overflow-hidden rounded-full border border-line bg-sunken">
        {counts.map((entry) =>
          entry.count === 0 ? null : (
            <div
              key={entry.severity}
              style={{
                width: `${(entry.count / total) * 100}%`,
                background: meta[entry.severity].color,
              }}
              title={`${meta[entry.severity].label}: ${entry.count}`}
            />
          ),
        )}
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-4">
        {counts.map((entry) => (
          <div key={entry.severity}>
            <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: meta[entry.severity].color }}
                aria-hidden
              />
              {meta[entry.severity].label}
            </dt>
            <dd className={`mt-1.5 font-mono text-2xl font-semibold tabular-nums ${meta[entry.severity].text}`}>
              {entry.count}
            </dd>
            <dd className="font-mono text-xs text-ink-muted">
              {total ? Math.round((entry.count / total) * 100) : 0}% of findings
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
