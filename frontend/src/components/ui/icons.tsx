/**
 * Icons the icon set does not carry.
 *
 * lucide-react dropped its brand marks, and a GitHub App dashboard needs the
 * GitHub mark. Each icon here takes the same props as a Lucide one, so the
 * components that accept an `IconComponent` cannot tell them apart.
 */

import type { ComponentType, SVGProps } from 'react'

/** Anything that can be handed to a component's `icon` prop. */
export type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

export function Github(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      width="1em"
      height="1em"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.55v-2.16c-3.2.7-3.88-1.37-3.88-1.37-.53-1.35-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.78 2.7 1.26 3.36.97.1-.75.4-1.26.73-1.55-2.56-.3-5.25-1.29-5.25-5.72 0-1.27.45-2.3 1.19-3.11-.12-.3-.52-1.48.11-3.08 0 0 .97-.31 3.18 1.19a10.9 10.9 0 0 1 5.8 0c2.2-1.5 3.17-1.19 3.17-1.19.63 1.6.24 2.78.12 3.08.74.81 1.18 1.84 1.18 3.11 0 4.44-2.69 5.41-5.26 5.7.41.36.78 1.07.78 2.16v3.2c0 .3.21.66.8.55A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  )
}
