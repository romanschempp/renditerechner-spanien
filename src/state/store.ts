import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { blai30, type Inputs } from '../engine';
import type { Lang } from '../i18n';

export type Calc = 'rent' | 'sale';

export interface SavedObject {
  id: string;
  name: string;
  inputs: Inputs;
  updatedAt: number;
}

interface Persisted {
  version: 1;
  objects: SavedObject[];
  currentId: string;
  lang: Lang;
  calc: Calc;
}

const KEY = 'renditerechner.v1';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Ergänzt gespeicherte Eingaben um Felder, die in neueren Versionen dazugekommen sind. */
function mergeDefaults<T>(base: T, saved: unknown): T {
  if (base === null) return (saved === undefined ? null : saved) as T;
  if (Array.isArray(base)) return (Array.isArray(saved) ? saved : base) as T;
  if (base && typeof base === 'object') {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    if (saved && typeof saved === 'object') {
      for (const [k, v] of Object.entries(saved as Record<string, unknown>)) {
        out[k] = k in out ? mergeDefaults(out[k], v) : v;
      }
    }
    return out as T;
  }
  return (saved === undefined || (saved !== null && typeof saved !== typeof base) ? base : saved) as T;
}

function exampleObject(): SavedObject {
  return { id: uid(), name: 'Blai 30', inputs: blai30(), updatedAt: Date.now() };
}

function initial(): Persisted {
  const browserLang: Lang = typeof navigator !== 'undefined' && navigator.language?.startsWith('es') ? 'es' : 'de';
  const fresh = (): Persisted => {
    const o = exampleObject();
    return { version: 1, objects: [o], currentId: o.id, lang: browserLang, calc: 'rent' };
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const p = JSON.parse(raw) as Persisted;
    if (!Array.isArray(p.objects) || p.objects.length === 0) return fresh();
    const objects = p.objects.map((o) => ({ ...o, inputs: mergeDefaults(blai30(), o.inputs) }));
    return {
      version: 1,
      objects,
      currentId: objects.some((o) => o.id === p.currentId) ? p.currentId : objects[0].id,
      lang: p.lang === 'es' ? 'es' : 'de',
      calc: p.calc === 'sale' ? 'sale' : 'rent',
    };
  } catch {
    return fresh();
  }
}

export function useStore() {
  const [state, setState] = useState<Persisted>(initial);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch {
        /* Speicher voll oder gesperrt: App läuft ohne Speichern weiter */
      }
    }, 250);
  }, [state]);

  const current = useMemo(
    () => state.objects.find((o) => o.id === state.currentId) ?? state.objects[0],
    [state.objects, state.currentId],
  );

  const setInputs = useCallback((fn: (prev: Inputs) => Inputs) => {
    setState((s) => ({
      ...s,
      objects: s.objects.map((o) => (o.id === s.currentId ? { ...o, inputs: fn(o.inputs), updatedAt: Date.now() } : o)),
    }));
  }, []);

  const rename = useCallback((name: string) => {
    setState((s) => ({
      ...s,
      objects: s.objects.map((o) => (o.id === s.currentId ? { ...o, name, updatedAt: Date.now() } : o)),
    }));
  }, []);

  const select = useCallback((id: string) => setState((s) => ({ ...s, currentId: id })), []);

  const create = useCallback((name: string, inputs: Inputs = blai30()) => {
    const o: SavedObject = { id: uid(), name, inputs, updatedAt: Date.now() };
    setState((s) => ({ ...s, objects: [...s.objects, o], currentId: o.id }));
  }, []);

  const duplicate = useCallback((suffix: string) => {
    setState((s) => {
      const src = s.objects.find((o) => o.id === s.currentId);
      if (!src) return s;
      const o: SavedObject = { id: uid(), name: `${src.name} (${suffix})`, inputs: structuredClone(src.inputs), updatedAt: Date.now() };
      return { ...s, objects: [...s.objects, o], currentId: o.id };
    });
  }, []);

  const remove = useCallback(() => {
    setState((s) => {
      const rest = s.objects.filter((o) => o.id !== s.currentId);
      if (rest.length === 0) {
        const o = exampleObject();
        return { ...s, objects: [o], currentId: o.id };
      }
      return { ...s, objects: rest, currentId: rest[0].id };
    });
  }, []);

  const setLang = useCallback((lang: Lang) => setState((s) => ({ ...s, lang })), []);
  const setCalc = useCallback((calc: Calc) => setState((s) => ({ ...s, calc })), []);

  return { state, current, setInputs, rename, select, create, duplicate, remove, setLang, setCalc };
}

/** Kleine Komfort-Einstellungen pro Gerät (z. B. offene Abschnitte). */
export function usePref<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`rr.pref.${key}`);
      return raw == null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  });
  const set = useCallback(
    (next: T) => {
      setV(next);
      try {
        localStorage.setItem(`rr.pref.${key}`, JSON.stringify(next));
      } catch {
        /* ignorieren */
      }
    },
    [key],
  );
  return [v, set];
}
