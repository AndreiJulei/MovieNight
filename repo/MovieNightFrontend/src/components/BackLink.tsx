import { useRouter } from "../router";

/**
 * The single in-app Back control. Returns through browser history when the
 * user came from `fallback` (keeping their scroll spot), otherwise opens it.
 */
export default function BackLink({
  label,
  fallback,
  onBeforeBack,
  className = "",
}: {
  label: string;
  /** Where Back leads when the user did not arrive from there; omit to use the previous page. */
  fallback?: string;
  onBeforeBack?: () => void;
  className?: string;
}) {
  const { goBack } = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        onBeforeBack?.();
        goBack(fallback);
      }}
      className={`inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/50 px-3.5 py-1.5 text-xs font-semibold text-text-muted backdrop-blur-md transition-colors hover:border-white/30 hover:text-white ${className}`}
    >
      <span aria-hidden="true">←</span> {label}
    </button>
  );
}
