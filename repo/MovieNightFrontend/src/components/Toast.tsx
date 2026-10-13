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
}

interface ToastContextValue {
  toast: (t: Omit<Toast, "id">) => void;
}

const ToastCtx = createContext<ToastContextValue>({
  toast: () => {},
});

export function useToast() {
  return useContext(ToastCtx);
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = `toast-${++nextId}`;
    setToasts((prev) => [...prev, { ...t, id }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      {/* Toast container — fixed bottom-center, above nav */}
      <div className="fixed bottom-20 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2 lg:bottom-6">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

function ToastItem({
  toast: t,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setVisible(true));

    // Auto dismiss
    timerRef.current = setTimeout(
      () => {
        setVisible(false);
        setTimeout(onDismiss, 200);
      },
      t.duration ?? 3500,
    );

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [t, onDismiss]);

  const handleUndo = () => {
    t.onUndo?.();
    setVisible(false);
    setTimeout(onDismiss, 200);
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
      role="status"
      aria-live="polite"
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
          type="button"
          onClick={handleUndo}
          className="ml-1 rounded-md border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/20"
        >
          Undo
        </button>
      )}

      <button
        type="button"
        onClick={() => {
          setVisible(false);
          setTimeout(onDismiss, 200);
        }}
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
