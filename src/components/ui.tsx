import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import { parseNumber } from './parse';

export { parseNumber };

// ---------------------------------------------------------------- Accordion

export function Section({
  title, summary, children, level = 'section',
}: {
  id: string;
  title: string;
  summary?: ReactNode;
  children: ReactNode;
  level?: 'section' | 'panel';
}) {
  // Beim Öffnen der Seite sind alle Kästen zu – bewusst nicht gespeichert.
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  return (
    <section className={`acc acc--${level}${open ? ' is-open' : ''}`}>
      <h2 className="acc__h">
        <button type="button" className="acc__btn" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
          <span className="acc__title">{title}</span>
          {summary != null && <span className="acc__sum">{summary}</span>}
          <svg className="acc__chev" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </h2>
      {open && (
        <div id={bodyId} className="acc__body">
          {children}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Zahlen

export function NumberInput({
  value, onChange, digits = 2, min, max, ariaLabel, id, placeholder, allowEmpty = false, className,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  digits?: number;
  min?: number;
  max?: number;
  ariaLabel?: string;
  id?: string;
  placeholder?: string;
  allowEmpty?: boolean;
  className?: string;
}) {
  const { locale } = useI18n();
  const fmt = (v: number | null) =>
    v == null ? '' : new Intl.NumberFormat(locale, { maximumFractionDigits: digits, useGrouping: 'always' as unknown as boolean }).format(v);
  const [text, setText] = useState(fmt(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, locale, focused]);

  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));

  return (
    <input
      id={id}
      className={`num${className ? ` ${className}` : ''}`}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={text}
      onFocus={(e) => {
        setFocused(true);
        e.currentTarget.select();
      }}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseNumber(e.target.value);
        if (n != null) onChange(clamp(n));
        else if (e.target.value.trim() === '' && allowEmpty) onChange(null);
      }}
      onBlur={() => {
        setFocused(false);
        const n = parseNumber(text);
        if (n == null && !allowEmpty) onChange(value ?? 0);
        setText(fmt(n == null ? (allowEmpty ? null : value) : clamp(n)));
      }}
    />
  );
}

export function NumberField({
  label, value, onChange, unit, digits, min, max, hint, info, wide,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit: string;
  digits?: number;
  min?: number;
  max?: number;
  hint?: ReactNode;
  info?: string;
  wide?: boolean;
}) {
  const id = useId();
  return (
    <div className={`field${wide ? ' field--wide' : ''}`}>
      <label className="field__label" htmlFor={id}>
        {label}
        {info && <InfoTip text={info} />}
      </label>
      <div className="field__ctl">
        <NumberInput id={id} value={value} onChange={(v) => onChange(v ?? 0)} digits={digits} min={min} max={max} />
        <span className="field__unit" aria-hidden="true">{unit}</span>
      </div>
      {hint && <div className="field__hint">{hint}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Auswahl

export function Segmented<T extends string>({
  value, options, onChange, label, size = 'md',
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div className={`seg seg--${size}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`seg__opt${value === o.value ? ' is-on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, info }: { checked: boolean; onChange: (v: boolean) => void; label: string; info?: string }) {
  return (
    <div className="switch-row">
      <button type="button" role="switch" aria-checked={checked} className={`switch${checked ? ' is-on' : ''}`} onClick={() => onChange(!checked)}>
        <span className="switch__track" aria-hidden="true"><span className="switch__thumb" /></span>
        <span className="switch__label">{label}</span>
      </button>
      {info && <InfoTip text={info} />}
    </div>
  );
}

export function SelectField<T extends string>({
  label, value, options, onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <div className="field field--wide">
      <label className="field__label" htmlFor={id}>{label}</label>
      <div className="field__ctl field__ctl--select">
        <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Info

export function InfoTip({ text, label }: { text: string; label?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <span className="tip" ref={ref}>
      <button
        type="button"
        className="tip__btn"
        aria-label={label ?? t.common.info}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(!open);
        }}
      >
        i
      </button>
      {open && (
        <span role="tooltip" id={id} className="tip__pop">
          {text}
        </span>
      )}
    </span>
  );
}

export function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return <p className={`note note--${tone}`}>{children}</p>;
}

/** Wert mit Vorzeichenfarbe: negativ rot, positiv grün. */
export function Signed({ value, children }: { value: number | null | undefined; children: ReactNode }) {
  const cls = value == null || Math.abs(value) < 1e-9 ? '' : value < 0 ? 'neg' : 'pos';
  return <span className={cls}>{children}</span>;
}
