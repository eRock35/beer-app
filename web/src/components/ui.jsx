import { useEffect, useRef, useState } from 'react';
import { VERDICT_TONE, verdictFor } from '../lib/format.js';

export function Spinner({ label = 'Loading' }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span className="spinner" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Banner({ kind = 'info', children }) {
  if (!children) return null;
  return (
    <div className={`banner banner-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span aria-hidden="true">{kind === 'error' ? '⚠' : 'ℹ'}</span>
      <span>{children}</span>
    </div>
  );
}

export function Empty({ icon = '🍺', title, children, action }) {
  return (
    <div className="empty">
      <span className="empty-icon" aria-hidden="true">{icon}</span>
      <h3>{title}</h3>
      {children && <p className="secondary" style={{ maxWidth: '48ch', margin: '8px auto 16px' }}>{children}</p>}
      {action}
    </div>
  );
}

export function Stat({ value, label, note }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  );
}

/** Score plus its word. The colour is decoration; the label carries the meaning. */
export function ScorePill({ score, showLabel = true }) {
  const label = verdictFor(score);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span className="score-pill" style={{ '--tone': VERDICT_TONE[label] }}>
        {score ?? '—'}
      </span>
      {showLabel && <span className="secondary" style={{ fontSize: '0.82rem', fontWeight: 600 }}>{label}</span>}
    </span>
  );
}

export function Sheet({ open, onClose, title, subtitle, children, width }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="sheet-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        style={width ? { maxWidth: width } : undefined}
      >
        <div className="sheet-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p className="secondary" style={{ margin: '4px 0 0', fontSize: '0.88rem' }}>{subtitle}</p>}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, hint, children, id }) {
  return (
    <div className="field">
      {label && (
        <label className="label" htmlFor={id}>
          {label}
        </label>
      )}
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Confirm({ onConfirm, children, label = 'Delete' }) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return undefined;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  if (!armed) {
    return (
      <button type="button" className="btn btn-sm btn-danger" onClick={() => setArmed(true)}>
        {children || label}
      </button>
    );
  }
  return (
    <button type="button" className="btn btn-sm btn-danger" onClick={onConfirm}>
      Really? Tap again
    </button>
  );
}

/** Shared hover tooltip for the charts. */
export function useTooltip() {
  const [tip, setTip] = useState(null);
  const show = (event, content) =>
    setTip({ content, x: event.clientX, y: event.clientY });
  const hide = () => setTip(null);
  const node = tip ? (
    <div className="tooltip" style={{ left: tip.x + 12, top: tip.y - 34 }} role="status">
      {tip.content}
    </div>
  ) : null;
  return { show, hide, node };
}
