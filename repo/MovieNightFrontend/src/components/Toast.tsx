import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface Toast {
  id: string;
  message: string;
  type: "success" | "info" | "error";
  /** If provided, shows an Undo button that calls this */
  onUndo?: () => void;
  /** Auto-dismiss duration in ms (default 3500) */
  duration?: number;
  /** Move keyboard focus to Undo when the toast appears (an action taken by keyboard). */
  focusUndo?: boolean;
  /** Called when the toast closes while it holds focus, so focus can return to the page. */
  onCloseWithFocus?: () => void;
}

interface ToastContextValue {
  /** Shows a toast; the returned function closes it early (a no-op once it has gone). */
  toast: (t: Omit<Toast, "id">) => () => void;
}

const ToastCtx = createContext<ToastContextValue>({
  toast: () => () => {},
});

export function useToast() {
  return useContext(ToastCtx);
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Toasts asked to close early; each closes through its own animation and focus return.
  const [closeRequests, setCloseRequests] = useState<ReadonlySet<string>>(new Set());
  const live = useRef(new Set<string>());

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = `toast-${++nextId}`;
    live.current.add(id);
    setToasts((prev) => [...prev, { ...t, id }]);
    return () => {
      if (live.current.has(id)) setCloseRequests((prev) => new Set(prev).add(id));
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    live.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
    setCloseRequests((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      {/* Toast container — fixed bottom-center, above nav */}
      <div className="fixed bottom-20 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2 lg:bottom-6">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} closeRequested={closeRequests.has(t.id)} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

function ToastItem({
  toast: t,
  closeRequested,
  onDismiss,
}: {
  toast: Toast;
  closeRequested: boolean;
  onDismiss: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(false);
  // The provider re-creates onDismiss on every render; the timer must not restart because of it.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const close = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    const hadFocus = rootRef.current?.contains(document.activeElement) ?? false;
    setVisible(false);
    if (hadFocus) t.onCloseWithFocus?.();
    setTimeout(() => onDismissRef.current(), 200);
  }, [t]);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    // A toast holding focus stays until focus leaves it.
    if (rootRef.current?.contains(document.activeElement)) return;
    timerRef.current = setTimeout(close, t.duration ?? 3500);
  }, [close, t.duration]);

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setVisible(true));
    if (t.focusUndo) undoRef.current?.focus();
    startTimer();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [t, startTimer]);

  useEffect(() => {
    if (closeRequested) close();
  }, [closeRequested, close]);

  const handleUndo = () => {
    t.onUndo?.();
    close();
  };

  const borderColor =
    t.type === "success"
      ? "border-emerald-500/30"
      : t.type === "error"
        ? "border-danger/30"
        : "border-accent/30";

  const iconColor =
    t.type === "success"
      ? "text-emerald-400"
      : t.type === "error"
        ? "text-danger"
        : "text-accent";

  const icon =
    t.type === "success" ? "✓" : t.type === "error" ? "✕" : "ℹ";

  return (
    <div
      ref={rootRef}
      role="status"
      aria-live="polite"
      // Stays while it holds focus, so a keyboard user has time to reach Undo.
      onFocus={() => { if (timerRef.current) clearTimeout(timerRef.current); }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) startTimer(); }}
      onKeyDown={(e) => { if (e.key === "Escape") close(); }}
      className={`flex items-center gap-3 rounded-lg border ${borderColor} bg-[#0e1320]/95 px-4 py-2.5 shadow-2xl backdrop-blur-xl transition-all duration-200 ${
        visible
          ? "translate-y-0 opacity-100"
          : "translate-y-2 opacity-0"
      }`}
      style={{ minWidth: 220, maxWidth: 400 }}
    >
      <span className={`text-sm font-bold ${iconColor}`}>{icon}</span>
      <span className="text-xs font-medium text-text-primary">{t.message}</span>

      {t.onUndo && (
        <button
          ref={undoRef}
          type="button"
          onClick={handleUndo}
          // The ::after box widens the touch target to 44 px without changing the toast's look.
          className="relative ml-1 rounded-md border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/20 outline-none focus-visible:outline-2 focus-visible:outline-accent after:absolute after:left-1/2 after:top-1/2 after:h-11 after:min-w-11 after:w-full after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']"
        >
          Undo
        </button>
      )}

      <button
        type="button"
        onClick={close}
        className="ml-auto text-text-muted transition-colors hover:text-white"
        aria-label="Dismiss notification"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
