// PDF-Übersicht: eine A4-Seite mit den wichtigsten Zahlen, danach Grafiken und Jahresübersicht.
// Wird erst beim Klick geladen (dynamischer Import), damit jsPDF nicht im Start-Bundle landet.
import { jsPDF } from 'jspdf';
import { REGIONS, type BaseKpis, type Inputs, type RentResult, type SaleResult, type YearRow } from '../engine';
import type { I18n } from '../i18n';
import type { Calc } from '../state/store';
import { focusModel } from '../components/focus';

export interface ReportData {
  i18n: I18n;
  name: string;
  calc: Calc;
  inputs: Inputs;
  kpis: BaseKpis;
  rent: RentResult | null;
  sales: SaleResult[] | null;
}

type RGB = [number, number, number];
const NAVY: RGB = [0, 35, 73];
const GOLD: RGB = [153, 125, 99];
const GOLD_LIGHT: RGB = [194, 166, 139];
const INK: RGB = [15, 29, 46];
const INK2: RGB = [59, 71, 87];
const INK3: RGB = [106, 116, 130];
const HAIR: RGB = [228, 231, 235];
const TINT: RGB = [232, 237, 243];
const POS: RGB = [43, 106, 76];
const NEG: RGB = [169, 55, 47];
const NEG_ON_NAVY: RGB = [255, 179, 170];
const WHITE: RGB = [255, 255, 255];
const ON_NAVY_2: RGB = [204, 211, 219];
const DIVIDER_ON_NAVY: RGB = [68, 81, 96];

const W = 210;
const H = 297;
const M = 16;
const CW = W - 2 * M;

const SERIF = 'SourceSerif';
const SANS = 'PublicSans';

// ---------------------------------------------------------------- Schriften

const FONTS: [file: string, family: string, style: 'normal' | 'bold'][] = [
  ['SourceSerif4-Regular.ttf', SERIF, 'normal'],
  ['SourceSerif4-SemiBold.ttf', SERIF, 'bold'],
  ['PublicSans-Regular.ttf', SANS, 'normal'],
  ['PublicSans-SemiBold.ttf', SANS, 'bold'],
];
let fontCache: Promise<[string, string][]> | null = null;

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function loadFonts(): Promise<[string, string][]> {
  fontCache ??= Promise.all(
    FONTS.map(async ([file]) => {
      const res = await fetch(`${import.meta.env.BASE_URL}fonts/${file}`);
      if (!res.ok) throw new Error(`Schrift ${file} fehlt`);
      return [file, toBase64(await res.arrayBuffer())] as [string, string];
    }),
  ).catch((e) => {
    fontCache = null;
    throw e;
  });
  return fontCache;
}

// ---------------------------------------------------------------- Zeichenhilfen

class Pen {
  constructor(public doc: jsPDF) {}
  font(family: string, bold: boolean, size: number, color: RGB) {
    this.doc.setFont(family, bold ? 'bold' : 'normal');
    this.doc.setFontSize(size);
    this.doc.setTextColor(...color);
    return this;
  }
  text(s: string, x: number, y: number, align: 'left' | 'right' | 'center' = 'left') {
    this.doc.text(clean(s), x, y, { align, baseline: 'alphabetic' });
  }
  width(s: string) {
    return this.doc.getTextWidth(clean(s));
  }
  wrap(s: string, w: number): string[] {
    return this.doc.splitTextToSize(clean(s), w) as string[];
  }
  fill(c: RGB) {
    this.doc.setFillColor(...c);
    return this;
  }
  stroke(c: RGB, w: number) {
    this.doc.setDrawColor(...c);
    this.doc.setLineWidth(w);
    return this;
  }
  rect(x: number, y: number, w: number, h: number) {
    this.doc.rect(x, y, w, h, 'F');
  }
  line(x1: number, y1: number, x2: number, y2: number) {
    this.doc.line(x1, y1, x2, y2);
  }
}

// Schmale geschützte Leerzeichen aus Intl durch normale geschützte ersetzen (im Font sicher vorhanden)
const clean = (s: string) => s.replace(/ /g, ' ');

// ---------------------------------------------------------------- Export

export async function exportPdf(d: ReportData): Promise<void> {
  const doc = await buildPdf(d);
  const { t } = d.i18n;
  const date = new Date().toISOString().slice(0, 10);
  const safe = (d.name || t.objects.untitled).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  doc.save(`${t.pdf.file}-${safe}-${date}.pdf`);
}

export async function buildPdf(d: ReportData, fontLoader = loadFonts): Promise<jsPDF> {
  const fonts = await fontLoader();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  fonts.forEach(([file, b64], k) => {
    doc.addFileToVFS(file, b64);
    doc.addFont(file, FONTS[k][1], FONTS[k][2]);
  });
  const { t } = d.i18n;
  doc.setProperties({ title: `${d.name} · ${t.app.title}`, subject: t.focus.title, creator: t.app.title });
  doc.setLineCap('round');
  doc.setLineJoin('round');

  const pen = new Pen(doc);
  pageOne(pen, d);
  doc.addPage();
  pageTwo(pen, d);

  const total = doc.getNumberOfPages();
  for (let n = 1; n <= total; n++) {
    doc.setPage(n);
    footer(pen, d, n, total);
  }
  return doc;
}

// ---------------------------------------------------------------- Seite 1

function pageOne(pen: Pen, d: ReportData) {
  const { t, eur, fill, num } = d.i18n;
  const { inputs } = d;

  // Kopfband
  pen.fill(NAVY).rect(0, 0, W, 22);
  pen.fill(GOLD).rect(0, 22, W, 0.8);
  pen.font(SERIF, false, 13, WHITE).text(t.app.title, M, 13.5);
  const date = new Intl.DateTimeFormat(d.i18n.locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
  pen.font(SANS, false, 8, GOLD_LIGHT).text(fill(t.pdf.created, { date }), W - M, 13.5, 'right');

  // Titel
  pen.font(SERIF, true, 22, NAVY).text(d.name || t.objects.untitled, M, 37);
  const calcName = d.calc === 'rent' ? t.app.calcRent : t.app.calcSale;
  const sale = d.sales?.[1];
  const sub = [
    calcName,
    `${t.purchase.price} ${eur(inputs.purchase.price)}`,
    REGIONS[inputs.purchase.region].name,
    ...(sale ? [`${t.sale.hold} ${fill(t.pdf.termValue, { years: num(sale.holdYears, sale.holdYears % 1 ? 1 : 0) })}`] : []),
  ].join(', ');
  pen.font(SANS, false, 9, INK3).text(sub, M, 43.5);

  // Renditefeld
  const y0 = 50;
  focusBlock(pen, d, y0);

  // Listen
  const top = y0 + 85;
  const colW = (CW - 10) / 2;
  const xL = M;
  const xR = M + colW + 10;
  let yl = ledger(pen, xL, top, colW, t.overview.capital, capitalRows(d));
  ledger(pen, xL, yl + 6, colW, t.pdf.assumptions, assumptionRows(d));
  const years = d.rent ? d.rent.horizon : sale!.holdYears;
  yl = ledger(pen, xR, top, colW, t.overview.year1, year1Rows(d));
  ledger(pen, xR, yl + 6, colW, fill(t.overview.horizon, { years: num(years, years % 1 ? 1 : 0) }), horizonRows(d));
}

function focusBlock(pen: Pen, d: ReportData, y0: number) {
  const { t, eur, pct, fill } = d.i18n;
  const m = focusModel(d.i18n, d.calc, d.kpis, d.sales, d.inputs.excelLogic);
  const h = 74;
  pen.fill(NAVY).rect(M, y0, CW, h);
  pen.fill(GOLD_LIGHT).rect(M, y0, CW, 1);
  pen.font(SERIF, false, 10, GOLD_LIGHT).text(m.title, M + 7, y0 + 9);

  const colW = CW / 2;
  m.items.forEach((it, k) => {
    const x = M + k * colW + 7;
    const w = colW - 14;
    pen.font(SERIF, true, 13, WHITE).text(it.short, x, y0 + 18.5);
    const sw = pen.width(it.short);
    pen.font(SANS, false, 7.5, ON_NAVY_2).text(it.long, x + sw + 2.5, y0 + 18.5);
    pen.font(SERIF, false, 34, it.value != null && it.value < 0 ? NEG_ON_NAVY : WHITE).text(pct(it.value, 1), x - 0.6, y0 + 33);
    const vw = pen.width(pct(it.value, 1));
    if (it.range) {
      pen.font(SANS, false, 7.5, GOLD_LIGHT).text(fill(t.focus.range, { low: pct(it.range[0], 1), high: pct(it.range[1], 1) }), x + vw + 3, y0 + 33);
    }
    pen.font(SANS, false, 8, ON_NAVY_2);
    pen.wrap(it.what, w).slice(0, 2).forEach((line, i) => pen.text(line, x, y0 + 39.5 + i * 3.6));
    // Vermieten: Bruch mit Goldlinie. Verkaufen: Einsatz und Ergebnis.
    const [a, b] = it.rows;
    pen.font(SANS, false, 7.5, ON_NAVY_2).text(a.label, x, y0 + 51);
    pen.font(SERIF, true, 10, WHITE).text(eur(a.value), x + w, y0 + 51, 'right');
    pen.stroke(it.fraction ? GOLD_LIGHT : DIVIDER_ON_NAVY, 0.3).line(x, y0 + 53, x + w, y0 + 53);
    pen.font(SANS, false, 7.5, ON_NAVY_2).text(it.fraction ? `÷ ${b.label}` : b.label, x, y0 + 57.5);
    pen.font(SERIF, true, 10, !it.fraction && b.value < 0 ? NEG_ON_NAVY : WHITE).text(eur(b.value), x + w, y0 + 57.5, 'right');
  });
  pen.stroke(DIVIDER_ON_NAVY, 0.25).line(M + colW, y0 + 13, M + colW, y0 + 61);
  pen.line(M, y0 + 62, M + CW, y0 + 62);

  const label = m.footLabel;
  const value = m.footValue;
  pen.font(SERIF, true, 11, value < 0 ? NEG_ON_NAVY : WHITE).text(eur(value), M + CW - 7, y0 + 69.5, 'right');
  const vw = pen.width(eur(value));
  pen.font(SANS, false, 8, ON_NAVY_2).text(label, M + CW - 7 - vw - 2.5, y0 + 69.5, 'right');
  const lw = pen.width(label);
  const room = CW - 14 - vw - lw - 10;
  const withNote = m.year1Note ? pen.wrap(`${m.lever} ${m.year1Note}`, room) : [];
  const leverLines = withNote.length && withNote.length <= 2 ? withNote : pen.wrap(m.lever, room);
  leverLines.slice(0, 2).forEach((line, i) => pen.text(line, M + 7, y0 + 69.5 - (leverLines.length > 1 ? 1.8 : 0) + i * 3.6));
}

interface Row {
  label: string;
  value: string;
  note?: string;
  tone?: number | null;
}

function ledger(pen: Pen, x: number, y: number, w: number, title: string, rows: Row[]): number {
  pen.font(SERIF, true, 11, NAVY).text(title, x, y);
  pen.stroke(GOLD, 0.35).line(x, y + 2.2, x + w, y + 2.2);
  let cy = y + 2.2;
  const rh = 6.1;
  rows.forEach((r, k) => {
    const base = cy + rh / 2 + 1.3;
    pen.font(SANS, false, 8.3, INK2).text(r.label, x, base);
    let right = x + w;
    if (r.note) {
      pen.font(SANS, false, 6.8, INK3).text(r.note, right, base, 'right');
      right -= pen.width(r.note) + 1.5;
    }
    const tone = r.tone == null || Math.abs(r.tone) < 1e-9 ? INK : r.tone < 0 ? NEG : POS;
    pen.font(SERIF, true, 9.6, tone).text(r.value, right, base, 'right');
    cy += rh;
    if (k < rows.length - 1) pen.stroke(HAIR, 0.2).line(x, cy, x + w, cy);
  });
  return cy;
}

// ---------------------------------------------------------------- Zeilen

function capitalRows(d: ReportData): Row[] {
  const { t, eur, pct } = d.i18n;
  const cap = d.kpis.capital;
  return [
    { label: t.kpi.totalInvestment, value: eur(cap.totalInvestment) },
    { label: t.kpi.equity, value: eur(cap.equity), note: pct(cap.equityRatio, 0) },
    ...(cap.loan > 0
      ? [
          { label: t.overview.loan, value: eur(cap.loan), note: pct(cap.debtRatio, 0) },
          { label: t.kpi.loanPayment, value: eur(d.kpis.monthlyPayment), note: t.units.perMonthShort },
        ]
      : []),
  ];
}

function assumptionRows(d: ReportData): Row[] {
  const { t, eur, num, fill } = d.i18n;
  const { purchase: p, rental: r, financing: f, tax, sale } = d.inputs;
  const pc = (v: number, digits = 1) => `${num(v, v % 1 ? digits : 0)} %`;
  const rows: Row[] = [
    { label: t.purchase.region, value: REGIONS[p.region].name, note: `ITP ${pc(p.itpPct)}` },
    { label: t.purchase.totalAncillary, value: eur(d.kpis.purchase.ancillary) },
  ];
  if (d.kpis.purchase.renovation > 0) rows.push({ label: t.renovation.total, value: eur(d.kpis.purchase.renovation) });
  rows.push({ label: t.rental.rent, value: eur(r.monthlyRent), note: t.units.perMonthShort });
  rows.push({ label: t.rental.vacancy, value: r.vacancyMode === 'pct' ? pc(r.vacancyPct) : `${num(r.vacancyMonths, 1)} ${t.units.monthsShort}` });
  rows.push({
    label: t.rental.growth,
    value: r.growthMode === 'single'
      ? fill(t.pdf.perYear, { v: pc(r.growthPct) })
      : fill(t.pdf.growthSplit, { rent: pc(r.rentGrowthPct), cost: pc(r.costGrowthPct) }),
  });
  if (f.enabled && d.kpis.capital.loan > 0) {
    const y1 = d.kpis.schedule.years[0];
    rows.push({ label: t.financing.effectiveRate, value: y1 ? `${num(y1.ratePct, 2)} %` : '–', note: t.financing[f.rateType] });
    rows.push({
      label: t.financing.term,
      value: fill(t.pdf.termValue, { years: num(d.kpis.schedule.termMonths / 12, d.kpis.schedule.termMonths % 12 ? 1 : 0) }),
      note: t.financing[f.repayment],
    });
  }
  rows.push({ label: t.tax.rentalTax, value: tax.rentalTaxEnabled && !d.inputs.excelLogic ? pc(tax.rentalTaxPct) : t.common.off });
  if (d.calc === 'sale') rows.push({ label: t.sale.agent, value: pc(sale.agentPct) });
  return rows;
}

function year1Rows(d: ReportData): Row[] {
  const { t, eur, pct, num } = d.i18n;
  const { kpis } = d;
  const y = kpis.year1;
  return [
    { label: t.kpi.cashflow, value: eur(y.cashflow / 12), note: t.units.perMonthShort, tone: y.cashflow },
    { label: t.kpi.costs, value: eur(y.opCosts) },
    { label: t.kpi.grossYield, value: pct(kpis.grossYield) },
    { label: t.kpi.netYield, value: pct(kpis.netYield) },
    { label: t.kpi.cashOnCash, value: pct(y.cashOnCash), tone: y.cashOnCash },
    ...(kpis.capital.loan > 0 ? [{ label: t.kpi.dscr, value: y.dscr == null ? '–' : num(y.dscr, 2), tone: y.dscr == null ? null : y.dscr - 1 }] : []),
    { label: t.kpi.breakEven, value: kpis.breakEvenRent == null ? '–' : eur(kpis.breakEvenRent), note: t.units.perMonthShort },
    { label: t.kpi.vacancy, value: pct(kpis.vacancyRate, 1) },
  ];
}

function horizonRows(d: ReportData): Row[] {
  const { t, eur, pct, num, fill } = d.i18n;
  const r = d.rent;
  const s = d.sales?.[1];
  const res = (r ?? s)!;
  const rows: Row[] = [
    { label: t.kpi.profit, value: eur(r ? r.totalGain : s!.totalProfit), tone: r ? r.totalGain : s!.totalProfit },
    { label: t.kpi.irr, value: pct(res.irrEquity), tone: res.irrEquity },
    { label: t.kpi.irrTotal, value: pct(res.irrTotal), tone: res.irrTotal },
    { label: t.kpi.multiple, value: res.multiple == null ? '–' : `${num(res.multiple, 2)}×` },
  ];
  if (r) {
    rows.push(
      { label: t.kpi.payback, value: r.paybackYear == null ? `> ${r.horizon} ${t.units.years}` : fill(t.kpi.paybackValue, { year: num(r.paybackYear, 1) }) },
      { label: t.results.endValue, value: eur(r.endValue) },
      { label: t.results.endEquity, value: eur(r.endEquity) },
    );
  } else if (s) {
    rows.push(
      { label: t.results.salePrice, value: eur(s.salePrice) },
      { label: t.results.netProceeds, value: eur(s.netProceeds) },
    );
  }
  return rows;
}

// ---------------------------------------------------------------- Seite 2

function pageHeader(pen: Pen, d: ReportData) {
  pen.fill(NAVY).rect(0, 0, W, 12);
  pen.fill(GOLD).rect(0, 12, W, 0.6);
  pen.font(SERIF, false, 9.5, WHITE).text(d.name || d.i18n.t.objects.untitled, M, 8);
  pen.font(SANS, false, 7.5, GOLD_LIGHT).text(d.i18n.t.app.title, W - M, 8, 'right');
}

function sectionTitle(pen: Pen, title: string, y: number) {
  pen.font(SERIF, true, 12, NAVY).text(title, M, y);
  pen.stroke(GOLD, 0.35).line(M, y + 2.2, M + CW, y + 2.2);
}

function pageTwo(pen: Pen, d: ReportData) {
  const { t, num, fill } = d.i18n;
  pageHeader(pen, d);
  let y = 24;
  const rows = d.rent ? d.rent.rows : d.sales![1].rows;
  const financed = d.kpis.capital.loan > 0;

  if (d.sales) {
    const s = d.sales[1];
    sectionTitle(pen, fill(t.results.saleTitle, { years: num(s.holdYears, s.holdYears % 1 ? 1 : 0) }), y);
    y = scenarioTable(pen, d, d.sales, y + 4) + 10;
  }

  sectionTitle(pen, t.charts.cashflow, y);
  y = cashflowChart(pen, d, rows, y + 6, d.sales ? 44 : 52) + 10;

  sectionTitle(pen, t.charts.wealth, y);
  y = wealthChart(pen, d, rows, financed, y + 6, d.sales ? 44 : 52) + 10;

  if (y > H - 60) {
    pen.doc.addPage();
    pageHeader(pen, d);
    y = 24;
  }
  sectionTitle(pen, t.pdf.yearOverview, y);
  yearTable(pen, d, rows, financed, y + 4);
}

function scenarioTable(pen: Pen, d: ReportData, sales: SaleResult[], y: number): number {
  const { t, eur, pct } = d.i18n;
  const lines: { label: string; get: (s: SaleResult) => number | null; isPct?: boolean; strong?: boolean; tone?: boolean }[] = [
    { label: t.results.salePrice, get: (s) => s.salePrice },
    { label: t.results.saleCosts, get: (s) => -s.saleCosts },
    { label: t.results.capitalGainsTax, get: (s) => -s.capitalGainsTax },
    { label: t.results.balance, get: (s) => -s.balance },
    { label: t.results.netProceeds, get: (s) => s.netProceeds, strong: true },
    { label: t.results.sumCashflow, get: (s) => s.sumCashflow, tone: true },
    { label: t.results.totalProfit, get: (s) => s.totalProfit, strong: true, tone: true },
    { label: t.kpi.irr, get: (s) => s.irrEquity, isPct: true, tone: true },
    { label: t.kpi.irrTotal, get: (s) => s.irrTotal, isPct: true, tone: true },
  ];
  const labelW = 70;
  const cw = (CW - labelW) / 3;
  const rh = 6;
  // Spalte „realistisch“ hinterlegen
  pen.fill(TINT).rect(M + labelW + cw, y, cw, rh * (lines.length + 1));
  sales.forEach((s, k) => {
    pen.font(SANS, true, 7.8, k === 1 ? NAVY : INK3).text(t.sale[s.scenario], M + labelW + (k + 1) * cw - 2.5, y + 4.2, 'right');
  });
  let cy = y + rh;
  pen.stroke(GOLD_LIGHT, 0.25).line(M, cy, M + CW, cy);
  lines.forEach((l) => {
    const base = cy + 4.2;
    pen.font(SANS, l.strong ?? false, 8.2, l.strong ? INK : INK2).text(l.label, M, base);
    sales.forEach((s, k) => {
      const v = l.get(s);
      const txt = l.isPct ? pct(v) : v == null ? '–' : eur(v);
      const color = l.tone && v != null && Math.abs(v) > 1e-9 ? (v < 0 ? NEG : POS) : INK;
      pen.font(SERIF, l.strong ?? false, 9.2, color).text(txt, M + labelW + (k + 1) * cw - 2.5, base, 'right');
    });
    cy += rh;
    pen.stroke(HAIR, 0.2).line(M, cy, M + CW, cy);
  });
  return cy;
}

// ---------------------------------------------------------------- Grafiken

function niceScale(min: number, max: number, ticks = 4) {
  const span = Math.max(1, max - min);
  const raw = span / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw)!;
  return { lo: Math.floor(min / step) * step, hi: Math.ceil(max / step) * step, step };
}

function compact(d: ReportData, v: number) {
  const { eur, lang } = d.i18n;
  if (Math.abs(v) < 1000) return eur(v);
  const k = v / 1000;
  const n = d.i18n.num(k, Math.abs(k) % 1 ? 1 : 0);
  return lang === 'de' ? `${n} T€` : `${n} mil €`;
}

interface Plot {
  x: number;
  y: number;
  w: number;
  h: number;
  lo: number;
  hi: number;
}

function axes(pen: Pen, d: ReportData, top: number, height: number, min: number, max: number): Plot {
  const { lo, hi, step } = niceScale(Math.min(0, min), Math.max(0, max));
  const gutter = 17;
  const p: Plot = { x: M + gutter, y: top, w: CW - gutter, h: height - 6, lo, hi };
  for (let v = lo; v <= hi + step / 2; v += step) {
    const yy = sy(p, v);
    pen.stroke(Math.abs(v) < 1e-9 ? INK3 : HAIR, Math.abs(v) < 1e-9 ? 0.3 : 0.2).line(p.x, yy, p.x + p.w, yy);
    pen.font(SANS, false, 6.5, INK3).text(compact(d, v), p.x - 2, yy + 1.1, 'right');
  }
  return p;
}

const sy = (p: Plot, v: number) => p.y + p.h - ((v - p.lo) / (p.hi - p.lo || 1)) * p.h;

function yearTicks(n: number): number[] {
  // Jahr 1, dann gleichmäßige Schritte; das Endjahr nur, wenn es nicht am vorigen klebt
  const every = n <= 12 ? 1 : n <= 24 ? 2 : 5;
  const out = [1];
  for (let k = every === 2 ? 3 : every; k <= n; k += every) if (k > 1) out.push(k);
  if (out[out.length - 1] !== n) {
    if (n - out[out.length - 1] < Math.max(2, every / 2)) out.pop();
    out.push(n);
  }
  return out;
}

function cashflowChart(pen: Pen, d: ReportData, rows: YearRow[], top: number, height: number): number {
  const { eur } = d.i18n;
  const vals = rows.map((r) => r.cashflow);
  const p = axes(pen, d, top, height, Math.min(...vals), Math.max(...vals));
  const slot = p.w / rows.length;
  const bw = Math.min(6, slot * 0.62);
  const zero = sy(p, 0);
  const r = Math.min(0.9, bw / 2);
  rows.forEach((row, k) => {
    const cx = p.x + slot * (k + 0.5);
    const yy = sy(p, row.cashflow);
    const hgt = Math.abs(zero - yy);
    if (hgt < 0.05) return;
    pen.fill(row.cashflow < 0 ? NEG : NAVY);
    // abgerundetes Datenende, gerade an der Nulllinie
    const yTop = Math.min(yy, zero);
    pen.doc.roundedRect(cx - bw / 2, yTop, bw, hgt, Math.min(r, hgt / 2), Math.min(r, hgt / 2), 'F');
    if (hgt > r) pen.rect(cx - bw / 2, row.cashflow < 0 ? yTop : zero - r, bw, r);
  });
  // Beschriftung: erstes und letztes Jahr
  const label = (k: number) => {
    const row = rows[k];
    const cx = p.x + slot * (k + 0.5);
    const yy = sy(p, row.cashflow);
    const above = row.cashflow >= 0;
    pen.font(SERIF, true, 7.5, INK).text(eur(row.cashflow), cx, above ? yy - 1.5 : yy + 3.6, 'center');
  };
  label(0);
  if (rows.length > 1) label(rows.length - 1);
  yearTicks(rows.length).forEach((yr) => {
    pen.font(SANS, false, 6.5, INK3).text(String(yr), p.x + slot * (yr - 0.5), p.y + p.h + 4.2, 'center');
  });
  return p.y + p.h + 5;
}

function wealthChart(pen: Pen, d: ReportData, rows: YearRow[], financed: boolean, top: number, height: number): number {
  const { t, eur, num } = d.i18n;
  const series = [
    { label: t.table.propertyValue, color: NAVY, get: (r: YearRow) => r.propertyValue, start: d.inputs.purchase.price },
    ...(financed ? [{ label: t.table.balance, color: GOLD, get: (r: YearRow) => r.balance, start: d.kpis.capital.loan }] : []),
  ];
  // Legende oberhalb
  let lx = M + 17;
  series.forEach((s) => {
    pen.stroke(s.color, 0.55).line(lx, top - 1, lx + 5, top - 1);
    pen.font(SANS, false, 7.5, INK2).text(s.label, lx + 6.5, top);
    lx += 6.5 + pen.width(s.label) + 7;
  });
  const all = series.flatMap((s) => [s.start, ...rows.map(s.get)]);
  const p = axes(pen, d, top + 4, height - 4, Math.min(...all), Math.max(...all));
  const n = rows.length;
  const xAt = (tt: number) => p.x + (tt / (rows[n - 1].year - 1 + rows[n - 1].fraction)) * p.w;
  series.forEach((s) => {
    const pts: [number, number][] = [[xAt(0), sy(p, s.start)], ...rows.map((r) => [xAt(r.year - 1 + r.fraction), sy(p, s.get(r))] as [number, number])];
    pen.stroke(s.color, 0.55);
    for (let k = 1; k < pts.length; k++) pen.line(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1]);
    const [ex, ey] = pts[pts.length - 1];
    pen.fill(WHITE).doc.circle(ex, ey, 1.6, 'F');
    pen.fill(s.color).doc.circle(ex, ey, 1.1, 'F');
    // Endwert als Direktbeschriftung, Text in Textfarbe
    const v = s.get(rows[n - 1]);
    pen.font(SERIF, true, 7.5, INK).text(eur(v), ex - 2.5, ey + (v < (p.hi + p.lo) / 2 ? -2.2 : 3.8), 'right');
  });
  // x-Achse in vergangenen Jahren ab Kauf (0), bei Haltedauer mit Kommastelle auch das Ende
  const end = rows[n - 1].year - 1 + rows[n - 1].fraction;
  const whole = Math.floor(end + 1e-9);
  const ticks = [0, ...(whole >= 1 ? yearTicks(whole) : []).filter((k) => k > 1 || whole <= 12)];
  if (end - whole > 1e-9) {
    if (end - ticks[ticks.length - 1] < 0.4 && ticks.length > 1) ticks.pop();
    ticks.push(end);
  }
  ticks.forEach((tt) => {
    pen.font(SANS, false, 6.5, INK3).text(num(tt, tt % 1 ? 1 : 0), xAt(tt), p.y + p.h + 4.2, 'center');
  });
  return p.y + p.h + 5;
}

// ---------------------------------------------------------------- Jahrestabelle

function yearTable(pen: Pen, d: ReportData, rows: YearRow[], financed: boolean, y: number) {
  const { t, eur, num } = d.i18n;
  type Col = { label: string; get: (r: YearRow) => number; tone?: boolean; strong?: boolean };
  const cols: Col[] = [
    { label: t.table.effectiveRent, get: (r) => r.effectiveRent },
    { label: t.table.opCosts, get: (r) => -r.opCosts },
    ...(financed ? [{ label: t.table.interest, get: (r: YearRow) => -r.interest }, { label: t.table.principal, get: (r: YearRow) => -r.principal }] : []),
    { label: t.table.tax, get: (r) => -r.tax },
    { label: t.table.cashflow, get: (r) => r.cashflow, tone: true, strong: true },
    ...(financed ? [{ label: t.table.balance, get: (r: YearRow) => r.balance }] : []),
    { label: t.table.propertyValue, get: (r) => r.propertyValue },
  ];
  const yearW = 14;
  const cw = (CW - yearW) / cols.length;
  const rh = 4.9;
  const head = (yy: number) => {
    pen.font(SANS, true, 7, INK3).text(t.common.year, M, yy + 4.5);
    cols.forEach((c, k) => {
      const lines = pen.wrap(c.label, cw - 1.5);
      lines.slice(0, 2).forEach((ln, i) => pen.text(ln, M + yearW + (k + 1) * cw, yy + 4.5 - (lines.length > 1 ? 3 : 0) + i * 3, 'right'));
    });
    pen.stroke(GOLD_LIGHT, 0.25).line(M, yy + 6.5, M + CW, yy + 6.5);
    return yy + 6.5;
  };
  let cy = head(y + 2);
  rows.forEach((r, idx) => {
    if (cy + rh > H - 18) {
      pen.doc.addPage();
      pageHeader(pen, d);
      cy = head(20);
    }
    if (idx % 2 === 1) pen.fill([248, 249, 250]).rect(M, cy, CW, rh);
    const base = cy + 3.4;
    const yr = r.fraction < 1 ? `${r.year} (${num(r.fraction * 12, 0)} ${t.units.monthsShort})` : String(r.year);
    pen.font(SANS, false, 7, INK2).text(yr, M, base);
    cols.forEach((c, k) => {
      const v = c.get(r);
      const color = c.tone && Math.abs(v) > 1e-9 ? (v < 0 ? NEG : POS) : INK;
      pen.font(SANS, c.strong ?? false, 7, color).text(eur(v), M + yearW + (k + 1) * cw, base, 'right');
    });
    cy += rh;
  });
}

// ---------------------------------------------------------------- Fuß

function footer(pen: Pen, d: ReportData, n: number, total: number) {
  const { t, fill } = d.i18n;
  pen.stroke(HAIR, 0.25).line(M, H - 15, W - M, H - 15);
  pen.font(SANS, false, 6.5, INK3);
  pen.wrap(t.app.disclaimer, CW - 30).slice(0, 2).forEach((ln, i) => pen.text(ln, M, H - 11 + i * 3));
  pen.text(fill(t.pdf.page, { n, total }), W - M, H - 11, 'right');
}
