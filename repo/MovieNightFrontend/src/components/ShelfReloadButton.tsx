import { RELOAD_BUTTON_LABEL, RELOAD_BUTTON_ICON } from "./homeShelfLogic"

export interface ShelfReloadButtonProps {
  onReload: () => void
  disabled?: boolean
  label?: string
}

export default function ShelfReloadButton({
  onReload,
  disabled = false,
  label = "Reload list",
}: ShelfReloadButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onReload}
      aria-label={label}
      className="group/reload inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-text-muted transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent"
    >
      <span className="text-sm leading-none transition-transform group-hover/reload:rotate-180">
        {RELOAD_BUTTON_ICON}
      </span>
      <span>{RELOAD_BUTTON_LABEL}</span>
    </button>
  )
}
