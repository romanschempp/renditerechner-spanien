import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { de, type Dict } from './de';
import { es } from './es';

export type Lang = 'de' | 'es';
export const DICTS: Record<Lang, Dict> = { de, es };
const LOCALES: Record<Lang, string> = { de: 'de-DE', es: 'es-ES' };

export interface I18n {
  lang: Lang;
  t: Dict;
  locale: string;
  eur: (v: number, digits?: number) => string;
  num: (v: number, digits?: number) => string;
  pct: (v: number | null | undefined, digits?: number) => string;
  fill: (template: string, vars: Record<string, string | number>) => string;
}

const Ctx = createContext<I18n | null>(null);

export function makeI18n(lang: Lang): I18n {
  const locale = LOCALES[lang];
  const t = DICTS[lang];
  const cache = new Map<string, Intl.NumberFormat>();
  const fmt = (key: string, opts: Intl.NumberFormatOptions) => {
    let f = cache.get(key);
    if (!f) {
      f = new Intl.NumberFormat(locale, opts);
      cache.set(key, f);
    }
    return f;
  };
  // Intl lässt bei es-ES den Tausenderpunkt unter 10.000 weg; für Tabellen einheitlich erzwingen.
  const grouping = { useGrouping: 'always' as unknown as boolean };
  return {
    lang,
    t,
    locale,
    eur: (v, digits = 0) =>
      fmt(`e${digits}`, { style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits, ...grouping })
        .format(Object.is(Math.round(v * 10 ** digits), -0) ? 0 : v),
    num: (v, digits = 0) =>
      fmt(`n${digits}`, { minimumFractionDigits: digits, maximumFractionDigits: digits, ...grouping }).format(v),
    pct: (v, digits = 2) =>
      v == null || !isFinite(v)
        ? t.common.notDefined
        : fmt(`p${digits}`, { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v),
    fill: (template, vars) => template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')),
  };
}

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value = useMemo(() => makeI18n(lang), [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('I18nProvider fehlt');
  return v;
}
