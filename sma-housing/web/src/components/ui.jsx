import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { initials, TAG_TONE } from '../lib/format';

/* ---------------- Toast ---------------- */
const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, tone = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setItems((xs) => [...xs, { id, message, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col gap-2" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id}
            className="rounded-lg px-4 py-2.5 text-sm shadow-lg"
            style={{
              background: t.tone === 'error' ? 'var(--brick)' : 'var(--pine)',
              color: '#fff'
            }}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ---------------- Primitives ---------------- */
const TONE_VARS = {
  green: ['--leaf', '--leaf-soft'], amber: ['--amber', '--amber-soft'],
  brick: ['--brick', '--brick-soft'], blue: ['--blue', '--blue-soft'],
  violet: ['--violet', '--violet-soft'], grey: ['--ink-soft', '--line']
};

export function Tag({ children, tone }) {
  const [fg, bg] = TONE_VARS[tone || TAG_TONE[children] || 'grey'] || TONE_VARS.grey;
  return (
    <span className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
      style={{ color: `var(${fg})`, background: `var(${bg})` }}>
      {children}
    </span>
  );
}

export function Button({ variant = 'default', size = 'md', className = '', ...props }) {
  const base = 'inline-flex items-center justify-center gap-1.5 rounded-md font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const sizes = { sm: 'px-2.5 py-1 text-xs', md: 'px-3.5 py-2 text-sm' };
  const styles = {
    primary: { background: 'var(--pine)', color: '#fff', border: '1px solid var(--pine)' },
    default: { background: 'var(--card)', color: 'var(--ink)', border: '1px solid var(--line)' },
    danger: { background: 'var(--brick-soft)', color: 'var(--brick)', border: '1px solid transparent' },
    ghost: { background: 'transparent', color: 'var(--ink-soft)', border: '1px solid transparent' }
  };
  return <button {...props} className={`${base} ${sizes[size]} ${className}`} style={{ ...styles[variant], ...props.style }} />;
}

export function Card({ title, action, children, className = '', bodyClass = 'p-4' }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--line)' }}>
          <h2 className="text-base font-semibold">{title}</h2>
          {action}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--ink-soft)' }}>{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs" style={{ color: 'var(--ink-soft)' }}>{hint}</span>}
    </label>
  );
}

export const Input = (p) => <input {...p} className={`field ${p.className || ''}`} />;
export const Select = (p) => <select {...p} className={`field ${p.className || ''}`} />;
export const Textarea = (p) => <textarea {...p} className={`field ${p.className || ''}`} />;

export function Empty({ children = 'Nothing here yet.' }) {
  return <p className="px-1 py-8 text-center text-sm" style={{ color: 'var(--ink-soft)' }}>{children}</p>;
}

export function Avatar({ name, src, size = 36 }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  const style = { width: size, height: size, fontSize: size * 0.36 };
  if (src && !failed)
    return <img src={src} alt="" onError={() => setFailed(true)}
      className="shrink-0 rounded-full object-cover" style={{ ...style, background: 'var(--line)' }} />;
  return (
    <span className="grid shrink-0 place-items-center rounded-full font-semibold"
      style={{ ...style, background: 'var(--leaf-soft)', color: 'var(--leaf)' }}>
      {initials(name) || '?'}
    </span>
  );
}

/* ---------------- Modal ---------------- */
export function Modal({ open, title, onClose, children, footer, width = 560 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    // Move focus into the dialog so keyboard and screen-reader users land inside it.
    const t = setTimeout(() => {
      const first = ref.current?.querySelector('input,select,textarea,button');
      first?.focus();
    }, 0);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); clearTimeout(t); document.body.style.overflow = ''; };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title}
        className="card max-h-[92vh] w-full overflow-y-auto rounded-b-none sm:rounded-xl"
        style={{ maxWidth: width }}>
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b px-4 py-3"
          style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
          <h2 className="text-base font-semibold">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">✕</Button>
        </header>
        <div className="p-4">{children}</div>
        {footer && (
          <footer className="sticky bottom-0 flex justify-end gap-2 border-t px-4 py-3"
            style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

/* Confirm dialog — replaces window.confirm so destructive actions are themed
   and keyboard-navigable like the rest of the app. */
export function useConfirm() {
  const [state, setState] = useState(null);
  const confirm = useCallback((message, { title = 'Are you sure?', confirmLabel = 'Confirm' } = {}) =>
    new Promise((resolve) => setState({ message, title, confirmLabel, resolve })), []);
  const node = state ? (
    <Modal open title={state.title} onClose={() => { state.resolve(false); setState(null); }} width={420}
      footer={<>
        <Button onClick={() => { state.resolve(false); setState(null); }}>Cancel</Button>
        <Button variant="danger" onClick={() => { state.resolve(true); setState(null); }}>{state.confirmLabel}</Button>
      </>}>
      <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{state.message}</p>
    </Modal>
  ) : null;
  return [confirm, node];
}

export function StatCard({ label, value, sub, tone }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-soft)' }}>{label}</div>
      <div className="tnum mt-1 text-2xl font-semibold" style={{ color: tone ? `var(--${tone})` : 'var(--ink)' }}>{value}</div>
      {sub && <div className="mt-0.5 text-xs" style={{ color: 'var(--ink-soft)' }}>{sub}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm" style={{ color: 'var(--ink-soft)' }}>{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function useDebounced(value, ms = 200) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return useMemo(() => v, [v]);
}
