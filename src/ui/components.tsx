import { useEffect, useState, type ReactNode } from 'react';

export function Spinner() {
  return <span className="spin" aria-label="Working" />;
}

export function Overlay({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="panel">{children}</div>
    </div>
  );
}

export function Busy({ label, ratio }: { label: string; ratio?: number }) {
  return (
    <div className="overlay">
      <div className="panel">
        <h2>
          <Spinner /> {label}
        </h2>
        {ratio !== undefined && (
          <div className="progress">
            <i style={{ width: `${Math.round(ratio * 100)}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Small transient message anchored above the action bar. */
export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 2600);
    return () => clearTimeout(timer);
  }, [message]);
  const node = message ? <div className="toast">{message}</div> : null;
  return { toast: setMessage, toastNode: node };
}

export function Confirm({
  title,
  detail,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: {
  title: string;
  detail?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Overlay onClose={onCancel}>
      <h2>{title}</h2>
      {detail && <p>{detail}</p>}
      <div className="row">
        <button className="btn" style={{ flex: 1 }} onClick={onCancel}>
          Cancel
        </button>
        <button className="btn primary danger" style={{ flex: 1 }} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Overlay>
  );
}

export const relativeDate = (ms: number) => {
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(ms).toLocaleDateString();
};
