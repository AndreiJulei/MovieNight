/** Quiet "Retry" action shown next to an unavailable section's notice. */
export default function RetryButton({
  onRetry,
  busy = false,
  label,
}: {
  onRetry: () => void
  busy?: boolean
  /** Accessible name when "Retry" alone would be ambiguous. */
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onRetry}
      disabled={busy}
      aria-label={label}
      className="quiet-action inline-flex min-h-8 items-center text-sm text-link disabled:opacity-50"
    >
      {busy ? "Retrying…" : "Retry"}
    </button>
  )
}
