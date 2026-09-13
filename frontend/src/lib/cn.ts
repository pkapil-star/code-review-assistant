/** Join class names, dropping anything falsy. Keeps conditional styling readable in JSX. */
export function cn(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ')
}
