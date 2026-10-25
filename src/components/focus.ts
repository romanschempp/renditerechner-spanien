import type { BaseKpis, SaleResult } from '../engine';
import type { I18n } from '../i18n';
import type { Calc } from '../state/store';

// Renditefeld für App und PDF: Vermieten zeigt das 1. Jahr, Verkaufen die Rendite nach Verkauf (IRR).

export interface FocusItem {
  key: 'ek' | 'gk';
  short: string;
  long: string;
  what: string;
  value: number | null;
  /** Vermieten: Zähler ÷ Nenner. Verkaufen: Einsatz und Ergebnis. */
  rows: [{ label: string; value: number }, { label: string; value: number }];
  fraction: boolean;
  /** Pessimistisch bis optimistisch, nur beim Verkauf */
  range?: [number | null, number | null];
}

export interface FocusModel {
  title: string;
  items: FocusItem[];
  lever: string;
  /** Zum Vergleich die laufende Rendite im 1. Jahr, nur beim Verkauf */
  year1Note?: string;
  footLabel: string;
  footValue: number;
}

export function yearsText(i18n: I18n, years: number): string {
  return i18n.num(years, years % 1 ? 1 : 0);
}

export function focusModel(i18n: I18n, calc: Calc, kpis: BaseKpis, sales: SaleResult[] | null, excel: boolean): FocusModel {
  const { t, fill, num, pct } = i18n;
  const y = kpis.year1;
  const cap = kpis.capital;
  const sale = calc === 'sale' ? sales?.[1] : undefined;

  const items: FocusItem[] = sale
    ? [
        {
          key: 'ek', short: t.focus.ekShort, long: t.focus.ekLongSale, what: t.focus.ekWhatSale, value: sale.irrEquity,
          rows: [{ label: t.focus.ekIn, value: cap.equity }, { label: t.focus.ekOut, value: sale.totalProfit }],
          fraction: false, range: [sales![0].irrEquity, sales![2].irrEquity],
        },
        {
          key: 'gk', short: t.focus.gkShort, long: t.focus.gkLongSale, what: t.focus.gkWhatSale, value: sale.irrTotal,
          rows: [{ label: t.focus.gkIn, value: cap.totalInvestment }, { label: t.focus.gkOut, value: sale.salePrice }],
          fraction: false, range: [sales![0].irrTotal, sales![2].irrTotal],
        },
      ]
    : [
        {
          key: 'ek', short: excel ? t.kpi.ekReturnExcel : t.focus.ekShort, long: t.focus.ekLong, what: t.focus.ekWhat, value: y.ekReturn,
          rows: [{ label: excel ? t.focus.ekNumExcel : t.focus.ekNum, value: y.noi - y.interest - y.tax }, { label: t.focus.ekDen, value: cap.equity }],
          fraction: true,
        },
        {
          key: 'gk', short: t.focus.gkShort, long: t.focus.gkLong, what: t.focus.gkWhat, value: y.gkReturn,
          rows: [{ label: t.focus.gkNum, value: y.noi - y.taxUnlevered }, { label: t.focus.gkDen, value: cap.totalInvestment }],
          fraction: true,
        },
      ];

  const [ek, gk] = items;
  const lever = ek.value != null && gk.value != null ? (ek.value - gk.value) * 100 : null;
  const leverTxt =
    cap.loan <= 0 || lever == null
      ? t.focus.leverNone
      : fill(lever >= 0 ? t.focus.leverUp : t.focus.leverDown, { pp: num(Math.abs(lever), 1) });

  if (sale) {
    const years = yearsText(i18n, sale.holdYears);
    return {
      title: fill(t.focus.titleSale, { years }),
      items,
      lever: leverTxt,
      year1Note: fill(t.focus.year1Note, { ek: pct(y.ekReturn, 1), gk: pct(y.gkReturn, 1) }),
      footLabel: fill(t.results.headlineSale, { years }),
      footValue: sale.totalProfit,
    };
  }
  return { title: t.focus.title, items, lever: leverTxt, footLabel: t.focus.cashflowMonth, footValue: y.cashflow / 12 };
}
