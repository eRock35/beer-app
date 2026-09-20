import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { VERDICT_TONE, verdictFor } from '../lib/format.js';
import { AlertIcon, CheckIcon, ChevronRightIcon, CloseIcon, InfoIcon } from './icons.jsx';

/* ------------------------------------------------------------------ */
/* small hooks                                                         */
/* ------------------------------------------------------------------ */

/** True while the media query matches. Used to pick phone vs desktop layouts. */
export function useMedia(query) {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export const usePhone = () => useMedia('(max-width: 767px)');

/* ------------------------------------------------------------------ */
/* status bits                                                         */
/* ------------------------------------------------------------------ */

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
      <span className="banner-icon" aria-hidden="true">
        {kind === 'error' ? <AlertIcon size={18} /> : <InfoIcon size={18} />}
      </span>
      <span>{children}</span>
    </div>
  );
}

/** Empty / error state. `icon` is a React node (an SVG glyph). */
export function Empty({ icon, title, children, action, tone }) {
  return (
    <div className={`empty${tone ? ` empty-${tone}` : ''}`}>
      {icon && <span className="empty-icon" aria-hidden="true">{icon}</span>}
      <h3>{title}</h3>
      {children && <p className="secondary empty-copy">{children}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', children, onRetry }) {
  return (
    <Empty
      icon={<AlertIcon size={32} />}
      title={title}
      tone="error"
      action={
        onRetry && (
          <button type="button" className="btn btn-secondary" onClick={onRetry}>
            Try again
          </button>
        )
      }
    >
      {children}
    </Empty>
  );
}

/** Skeleton rows that reserve the space a list will take, so nothing jumps. */
export function LoadingList({ rows = 3, height = 96 }) {
  return (
    <div className="stack" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height }} />
      ))}
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
      {showLabel && <span className="secondary score-word">{label}</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* grouped lists                                                       */
/* ------------------------------------------------------------------ */

/** iOS inset grouped list. Children are <Row>s. */
export function Group({ title, footer, children, className, style }) {
  return (
    <section className={`group${className ? ` ${className}` : ''}`} style={style}>
      {title && <div className="group-title">{title}</div>}
      <div className="group-body">{children}</div>
      {footer && <div className="group-footer">{footer}</div>}
    </section>
  );
}

/**
 * One row of a group. `onClick` makes the whole row a button; `href` makes it
 * a link. Renders a chevron on tappable rows unless `trailing` is given.
 */
export function Row({ icon, title, subtitle, trailing, onClick, href, chevron, destructive, as, ...rest }) {
  const body = (
    <>
      {icon && <span className="row-icon" aria-hidden="true">{icon}</span>}
      <span className="row-text">
        <span className="row-title">{title}</span>
        {subtitle && <span className="row-subtitle">{subtitle}</span>}
      </span>
      {trailing != null && <span className="row-trailing">{trailing}</span>}
      {(chevron ?? (onClick || href)) && trailing == null && (
        <span className="row-chevron" aria-hidden="true">
          <ChevronRightIcon size={18} />
        </span>
      )}
    </>
  );
  const cls = `list-row${icon ? ' has-icon' : ''}${onClick || href ? ' list-row-tappable' : ''}${destructive ? ' list-row-destructive' : ''}`;
  if (href) {
    return (
      <a className={cls} href={href} {...rest}>
        {body}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} {...rest}>
        {body}
      </button>
    );
  }
  const Tag = as || 'div';
  return (
    <Tag className={cls} {...rest}>
      {body}
    </Tag>
  );
}

/** Segmented control. `options` = [{value,label}] */
export function Segmented({ value, onChange, options, label }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className="segmented-item"
          onClick={() => onChange(o.value)}
        >
          {o.icon && <span className="segmented-icon" aria-hidden="true">{o.icon}</span>}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function IconButton({ label, children, className, ...rest }) {
  return (
    <button type="button" className={`icon-btn${className ? ` ${className}` : ''}`} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* forms                                                               */
/* ------------------------------------------------------------------ */

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

/** A filled, inset card that groups a form's fields. */
export function FormGroup({ children, className, style }) {
  return (
    <div className={`form-group${className ? ` ${className}` : ''}`} style={style}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* sheet                                                               */
/* ------------------------------------------------------------------ */

let openSheets = 0;

function lockBody() {
  openSheets += 1;
  if (openSheets === 1) {
    document.body.dataset.scrollY = String(window.scrollY);
    document.body.classList.add('is-locked');
    document.body.style.top = `-${window.scrollY}px`;
  }
}

function unlockBody() {
  openSheets = Math.max(0, openSheets - 1);
  if (openSheets === 0) {
    const y = Number(document.body.dataset.scrollY || 0);
    document.body.classList.remove('is-locked');
    document.body.style.top = '';
    delete document.body.dataset.scrollY;
    window.scrollTo(0, y);
  }
}

/**
 * Bottom sheet on phones, centred modal card on wider screens. Closes on the
 * backdrop, Escape, the close button, or a downward swipe on the grabber/head.
 */
export function Sheet({ open, onClose, title, subtitle, children, width, full, plain, footer }) {
  const ref = useRef(null);
  const [closing, setClosing] = useState(false);
  const drag = useRef(null);
  const [dragY, setDragY] = useState(0);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => {
      setClosing(false);
      setDragY(0);
      onClose?.();
    }, reduce ? 0 : 200);
  }, [closing, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') requestClose();
    };
    document.addEventListener('keydown', onKey);
    lockBody();
    const previouslyFocused = document.activeElement;
    // Focus the first control if there is one, else the sheet itself.
    const target = ref.current?.querySelector(
      'input:not([type=hidden]):not([disabled]), textarea, select, button:not(.sheet-close)'
    );
    setTimeout(() => (target || ref.current)?.focus?.({ preventScroll: true }), 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      unlockBody();
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open, requestClose]);

  if (!open) return null;

  const onTouchStart = (e) => {
    drag.current = { y: e.touches[0].clientY };
  };
  const onTouchMove = (e) => {
    if (!drag.current) return;
    const dy = e.touches[0].clientY - drag.current.y;
    if (dy > 0) setDragY(dy);
  };
  const onTouchEnd = () => {
    if (!drag.current) return;
    const dy = dragY;
    drag.current = null;
    if (dy > 90) requestClose();
    else setDragY(0);
  };

  // Rendered at the body so no ancestor's stacking context (the phone map
  // shell is position: fixed) can trap it under the header or tab bar.
  return createPortal(
    <div
      className={`sheet-backdrop${closing ? ' is-closing' : ''}`}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        className={`sheet${full ? ' sheet-full' : ''}${plain ? ' sheet-plain' : ''}${closing ? ' is-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        style={{
          ...(width ? { '--sheet-w': `${width}px` } : null),
          ...(dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : null),
        }}
      >
        <div
          className="sheet-grab"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          <span className="grabber" aria-hidden="true" />
        </div>
        {(title || subtitle) && (
          <div className="sheet-head" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
            <div className="sheet-head-text">
              {title && <h2 className="sheet-title">{title}</h2>}
              {subtitle && <p className="sheet-subtitle">{subtitle}</p>}
            </div>
            <IconButton className="sheet-close" label="Close" onClick={requestClose}>
              <CloseIcon size={18} />
            </IconButton>
          </div>
        )}
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------------ */
/* toasts + dialogs                                                    */
/* ------------------------------------------------------------------ */

const FeedbackContext = createContext(null);

/**
 * One provider gives every view `toast()`, `confirm()` and `prompt()` — the
 * in-page replacements for the browser's native dialogs.
 */
export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [promptValue, setPromptValue] = useState('');

  const toast = useCallback((message, { kind = 'info', duration = 3000 } = {}) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), duration);
  }, []);

  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        const options = typeof opts === 'string' ? { message: opts } : opts;
        setDialog({ type: 'confirm', ...options, resolve });
      }),
    []
  );

  const prompt = useCallback(
    (opts) =>
      new Promise((resolve) => {
        const options = typeof opts === 'string' ? { message: opts } : opts;
        setPromptValue(options.defaultValue || '');
        setDialog({ type: 'prompt', ...options, resolve });
      }),
    []
  );

  const settle = (value) => {
    dialog?.resolve(value);
    setDialog(null);
  };

  const value = useMemo(() => ({ toast, confirm, prompt }), [toast, confirm, prompt]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} role="status">
            <span className="toast-icon" aria-hidden="true">
              {t.kind === 'error' ? <AlertIcon size={16} /> : t.kind === 'success' ? <CheckIcon size={16} /> : <InfoIcon size={16} />}
            </span>
            {t.message}
          </div>
        ))}
      </div>

      {dialog?.type === 'confirm' && (
        <Sheet open onClose={() => settle(false)} plain width={400}>
          <div className="action-sheet">
            {dialog.title && <div className="action-title">{dialog.title}</div>}
            {dialog.message && <div className="action-message">{dialog.message}</div>}
            <button
              type="button"
              className={`btn btn-block btn-lg ${dialog.destructive ? 'btn-destructive-fill' : 'btn-primary'}`}
              onClick={() => settle(true)}
            >
              {dialog.action || 'OK'}
            </button>
            <button type="button" className="btn btn-block btn-lg btn-secondary" onClick={() => settle(false)}>
              {dialog.cancel || 'Cancel'}
            </button>
          </div>
        </Sheet>
      )}

      {dialog?.type === 'prompt' && (
        <Sheet open onClose={() => settle(null)} title={dialog.title || 'Enter a value'} width={440}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              settle(promptValue);
            }}
          >
            <FormGroup>
              <Field label={dialog.message} id="prompt-input">
                <input
                  id="prompt-input"
                  className="input"
                  value={promptValue}
                  onChange={(e) => setPromptValue(e.target.value)}
                  placeholder={dialog.placeholder}
                  enterKeyHint="done"
                />
              </Field>
            </FormGroup>
            <button type="submit" className="btn btn-primary btn-block btn-lg">
              {dialog.action || 'Save'}
            </button>
          </form>
        </Sheet>
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used inside FeedbackProvider');
  return ctx;
}

export const useToast = () => useFeedback().toast;

/**
 * A destructive button that asks first. Small actions get the iOS action
 * sheet: message, red action, separate Cancel.
 */
export function Confirm({ onConfirm, children, label = 'Delete', message, title, className = 'btn btn-sm btn-destructive' }) {
  const { confirm } = useFeedback();
  const text = children || label;
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        const ok = await confirm({
          title: title || `${text}?`,
          message: message || 'This cannot be undone.',
          action: text,
          destructive: true,
        });
        if (ok) onConfirm();
      }}
    >
      {text}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* chart tooltip                                                       */
/* ------------------------------------------------------------------ */

/**
 * Shared tooltip for the charts. Works on hover and on tap: a tap shows it for
 * a couple of seconds, a tap elsewhere hides it. The position is clamped so it
 * never runs off the right edge of a phone.
 */
export function useTooltip() {
  const [tip, setTip] = useState(null);
  const timer = useRef(null);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setTip(null);
  }, []);

  const show = useCallback((event, content) => {
    clearTimeout(timer.current);
    const x = event.clientX ?? event.touches?.[0]?.clientX ?? 0;
    const y = event.clientY ?? event.touches?.[0]?.clientY ?? 0;
    setTip({ content, x, y });
    if (event.pointerType === 'touch' || event.type === 'touchstart' || event.type === 'click') {
      timer.current = setTimeout(() => setTip(null), 2600);
    }
  }, []);

  useEffect(() => {
    if (!tip) return undefined;
    const off = (e) => {
      if (e.target.closest?.('.bar-hit, .chart-dot')) return;
      hide();
    };
    document.addEventListener('pointerdown', off, true);
    return () => document.removeEventListener('pointerdown', off, true);
  }, [tip, hide]);

  const bind = useCallback(
    (content) => ({
      onPointerEnter: (e) => e.pointerType === 'mouse' && show(e, content),
      onPointerLeave: (e) => e.pointerType === 'mouse' && hide(),
      onPointerDown: (e) => e.pointerType !== 'mouse' && show(e, content),
      onClick: (e) => show(e, content),
      tabIndex: 0,
      onFocus: (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        show({ clientX: r.left + r.width / 2, clientY: r.top }, content);
      },
      onBlur: hide,
    }),
    [show, hide]
  );

  const node = tip ? <TooltipNode tip={tip} /> : null;
  return { show, hide, bind, node };
}

function TooltipNode({ tip }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: tip.x + 12, top: tip.y - 40 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    let left = tip.x - w / 2;
    left = Math.max(8, Math.min(vw - w - 8, left));
    let top = tip.y - h - 14;
    if (top < 8) top = tip.y + 18;
    setPos({ left, top });
  }, [tip]);
  return (
    <div className="tooltip" ref={ref} style={pos} role="status">
      {tip.content}
    </div>
  );
}
