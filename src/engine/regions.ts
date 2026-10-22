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
  CT: { name: 'Cataluña', itp: 10, ajd: 1.5, tiered: true },
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
