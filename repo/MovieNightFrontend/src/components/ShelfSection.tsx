import type { ReactNode } from "react"

/**
 * One row (shelf): heading directly above its items, with an optional
 * subtitle and right-aligned actions (Reload, View all). Every row page
 * uses this so headings and spacing match (#21 RO04).
 */
export default function ShelfSection({
  title,
  subtitle,
  actions,
  ariaLabel,
  children,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  ariaLabel?: string
  children: ReactNode
}) {
  return (
    <section data-shelf-section aria-label={ariaLabel} className="relative">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-text-primary sm:text-xl lg:text-2xl">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2.5 pt-0.5 lg:pt-1">
            {actions}
          </div>
        )}
      </div>
      {children}
    </section>
  )
}
