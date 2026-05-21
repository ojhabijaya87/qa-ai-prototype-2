import { useToasts } from "@/store/promo";
import "./ToastTray.css";

export default function ToastTray() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-tray" data-testid="toast-tray" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast--${toast.variant}`}
          data-testid={`toast-${toast.variant}`}
          data-toast-id={toast.id}
        >
          <span className="toast-message">{toast.message}</span>
          <button
            type="button"
            className="toast-dismiss font-mono"
            onClick={() => dismiss(toast.id)}
            data-testid={`toast-dismiss-${toast.id}`}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
