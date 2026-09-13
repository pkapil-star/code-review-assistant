/**
 * A minimal syntax highlighter.
 *
 * A full highlighting library is around 200 KB for what this product needs:
 * colouring one line of a diff at a time. This tokenises a single line with one
 * pass of a combined regular expression, which is enough for the languages the
 * analyser actually reads and costs nothing to load.
 *
 * It deliberately does not track state across lines, so an unterminated string
 * is coloured as a string only to the end of its own line. For a diff view that
 * is the correct trade: lines are rendered independently anyway.
 */

import { Fragment, type ReactNode } from 'react'

const KEYWORDS = new Set([
  // Python
  'def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'in', 'not',
  'and', 'or', 'import', 'from', 'as', 'with', 'try', 'except', 'finally',
  'raise', 'pass', 'break', 'continue', 'lambda', 'yield', 'global', 'nonlocal',
  'assert', 'del', 'async', 'await', 'is',
  // JavaScript and TypeScript
  'const', 'let', 'var', 'function', 'export', 'default', 'new', 'typeof',
  'interface', 'type', 'implements', 'extends', 'public', 'private', 'readonly',
  'switch', 'case', 'throw', 'catch', 'instanceof',
])

const LITERALS = new Set(['True', 'False', 'None', 'true', 'false', 'null', 'undefined', 'self', 'this'])

const TOKEN = new RegExp(
  [
    '(?<comment>#.*$|\\/\\/.*$)',
    '(?<string>"""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\'|f?"(?:[^"\\\\]|\\\\.)*"|f?\'(?:[^\'\\\\]|\\\\.)*\'|`(?:[^`\\\\]|\\\\.)*`)',
    '(?<decorator>@[\\w.]+)',
    '(?<number>\\b\\d[\\d_]*(?:\\.\\d+)?\\b)',
    '(?<call>\\b[A-Za-z_][\\w]*(?=\\())',
    '(?<word>\\b[A-Za-z_][\\w]*\\b)',
  ].join('|'),
  'g',
)

const CLASS_FOR = {
  comment: 'text-ink-muted italic',
  string: 'text-success',
  decorator: 'text-warning',
  number: 'text-warning',
  keyword: 'text-accent font-medium',
  literal: 'text-warning',
  call: 'text-info',
} as const

/** Render one line of source as coloured spans. */
export function highlightLine(line: string, language = 'python'): ReactNode {
  // Anything the analyser does not read is shown as plain text rather than
  // guessed at with the wrong keyword set.
  if (!['python', 'javascript', 'typescript', 'tsx', 'jsx', 'text'].includes(language)) {
    return line
  }

  const nodes: ReactNode[] = []
  let cursor = 0
  let key = 0

  TOKEN.lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = TOKEN.exec(line)) !== null) {
    const groups = match.groups ?? {}

    if (match.index > cursor) {
      nodes.push(<Fragment key={key++}>{line.slice(cursor, match.index)}</Fragment>)
    }

    const text = match[0]
    let className: string | null = null

    if (groups.comment) className = CLASS_FOR.comment
    else if (groups.string) className = CLASS_FOR.string
    else if (groups.decorator) className = CLASS_FOR.decorator
    else if (groups.number) className = CLASS_FOR.number
    else if (groups.call) className = KEYWORDS.has(text) ? CLASS_FOR.keyword : CLASS_FOR.call
    else if (groups.word) {
      if (KEYWORDS.has(text)) className = CLASS_FOR.keyword
      else if (LITERALS.has(text)) className = CLASS_FOR.literal
    }

    nodes.push(
      className ? (
        <span key={key++} className={className}>
          {text}
        </span>
      ) : (
        <Fragment key={key++}>{text}</Fragment>
      ),
    )

    cursor = match.index + text.length
  }

  if (cursor < line.length) {
    nodes.push(<Fragment key={key++}>{line.slice(cursor)}</Fragment>)
  }

  return nodes
}

/** Guess a language from a file extension, for files the API did not label. */
export function languageFor(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase() ?? ''

  const map: Record<string, string> = {
    py: 'python',
    js: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
  }

  return map[extension] ?? 'text'
}
