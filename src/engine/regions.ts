import type { RegionCode } from './types';

/**
 * Allgemeine Standardsätze für Wohnimmobilien (ohne Ermäßigungen für junge Käufer,
 * Familien usw.). Mehrere Regionen staffeln nach Kaufpreis – hier steht jeweils der
 * Eingangssatz. Quellen widersprechen sich teilweise, deshalb immer prüfen.
 */
export const RATES_AS_OF = '2026-10';

export interface RegionRates {
  name: string;
  itp: number;
  ajd: number;
  /** Satz gestaffelt nach Kaufpreis */
  tiered?: boolean;
  /**
   * Progressiver ITP-Tarif: jeder Satz gilt nur für den Teil des Kaufpreises bis `upTo`.
   * Wird angewendet, solange der ITP-Satz dem Eingangssatz `itp` der Region entspricht.
   */
  itpBrackets?: { upTo: number; rate: number }[];
}

export const REGIONS: Record<RegionCode, RegionRates> = {
  AN: { name: 'Andalucía', itp: 7, ajd: 1.2 },
  AR: { name: 'Aragón', itp: 8, ajd: 1.5, tiered: true },
  AS: { name: 'Asturias', itp: 8, ajd: 1.2, tiered: true },
  IB: { name: 'Illes Balears', itp: 8, ajd: 1.2, tiered: true },
  CN: { name: 'Canarias', itp: 6.5, ajd: 0.75 },
  CB: { name: 'Cantabria', itp: 10, ajd: 1.5 },
  CM: { name: 'Castilla-La Mancha', itp: 9, ajd: 1.25 },
  CL: { name: 'Castilla y León', itp: 8, ajd: 1.5, tiered: true },
  CT: {
    name: 'Cataluña', itp: 10, ajd: 1.5, tiered: true,
    // Escala general 2026: 10 % bis 600.000 €, darüber 11/12/13 % jeweils auf den Überschuss
    itpBrackets: [
      { upTo: 600000, rate: 10 },
      { upTo: 900000, rate: 11 },
      { upTo: 1500000, rate: 12 },
      { upTo: Infinity, rate: 13 },
    ],
  },
  VC: { name: 'Comunitat Valenciana', itp: 9, ajd: 1.5 },
  EX: { name: 'Extremadura', itp: 8, ajd: 1.5, tiered: true },
  GA: { name: 'Galicia', itp: 9, ajd: 1.5 },
  MD: { name: 'Madrid', itp: 6, ajd: 0.75 },
  MC: { name: 'Región de Murcia', itp: 7.75, ajd: 1.5 },
  NC: { name: 'Navarra', itp: 6, ajd: 0.5 },
  PV: { name: 'País Vasco', itp: 4, ajd: 0.5 },
  RI: { name: 'La Rioja', itp: 7, ajd: 1 },
  CE: { name: 'Ceuta', itp: 6, ajd: 0.5 },
  ML: { name: 'Melilla', itp: 6, ajd: 0.5 },
};

export const REGION_CODES = Object.keys(REGIONS) as RegionCode[];

/** Gilt für diese Eingaben der progressive ITP-Tarif der Region (statt eines Pauschalsatzes)? */
export function itpIsProgressive(code: RegionCode, itpPct: number): boolean {
  const r = REGIONS[code];
  return !!r.itpBrackets && itpPct === r.itp;
}

/** Höchster Satz der Region (für Anzeigen wie „ITP 10–13 %“). */
export function itpTopRate(code: RegionCode): number {
  const b = REGIONS[code].itpBrackets;
  return b ? b[b.length - 1].rate : REGIONS[code].itp;
}

/**
 * ITP in € für einen Kaufpreis. Mit progressivem Tarif wird jeder Tramo nur auf seinen
 * Anteil angewendet; hat der Nutzer den Satz überschrieben, gilt dieser pauschal.
 */
export function itpAmount(price: number, code: RegionCode, itpPct: number): number {
  const brackets = REGIONS[code].itpBrackets;
  if (!brackets || !itpIsProgressive(code, itpPct)) return price * (itpPct / 100);
  let tax = 0;
  let lower = 0;
  for (const b of brackets) {
    if (price <= lower) break;
    tax += (Math.min(price, b.upTo) - lower) * (b.rate / 100);
    lower = b.upTo;
  }
  return tax;
}
