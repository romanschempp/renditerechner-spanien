import { irr, type Flow } from './irr';
import { balanceAfter, buildSchedule, rateFunction, sumMonths, type LoanSchedule } from './loan';
import type { Inputs, ScenarioKey } from './types';

/** Gesetzlich fester Einbehalt durch den Käufer bei Verkauf durch Nichtresidenten. */
export const NON_RESIDENT_RETENTION = 0.03;
export const MAX_YEARS = 40;

/** Amortización: 3 % p. a. auf den Gebäudewert ohne Boden (inkl. Renovierung/Mejoras). */
export const DEPRECIATION_RATE = 0.03;
/** IRPF-Sparbasis (base del ahorro), Stand 2026: Obergrenze des Tramo in € und Satz. */
export const SAVINGS_BRACKETS: { upTo: number; rate: number }[] = [
  { upTo: 6000, rate: 0.19 },
  { upTo: 50000, rate: 0.21 },
  { upTo: 200000, rate: 0.23 },
  { upTo: 300000, rate: 0.27 },
  { upTo: Infinity, rate: 0.3 },
];
/** IRNR: Nichtresidenten (EU/EWR) zahlen auf Veräußerungsgewinne pauschal 19 %. */
export const NON_RESIDENT_GAINS_RATE = 0.19;
/** Excel-Logik: pauschaler Satz der Excel „Simulación Blai 30“. */
export const EXCEL_GAINS_RATE = 0.21;

const pct = (v: number) => v / 100;
const safeDiv = (a: number, b: number): number | null => (b > 0 ? a / b : null);

/** Progressive Steuer der Sparbasis: jeder Tramo nur auf seinen Anteil. */
export function savingsTax(gain: number): number {
  let tax = 0;
  let lower = 0;
  for (const b of SAVINGS_BRACKETS) {
    if (gain <= lower) break;
    tax += (Math.min(gain, b.upTo) - lower) * b.rate;
    lower = b.upTo;
  }
  return tax;
}

export function capitalGainsTax(i: Inputs, taxableGain: number): number {
  if (taxableGain <= 0) return 0;
  if (i.excelLogic) return taxableGain * EXCEL_GAINS_RATE;
  if (i.tax.nonResident) return taxableGain * NON_RESIDENT_GAINS_RATE;
  return savingsTax(taxableGain);
}

// ---------------------------------------------------------------- Kauf

export interface PurchaseBreakdown {
  price: number;
  itp: number;
  iva: number;
  ajd: number;
  taxes: number;
  fees: {
    notary: number;
    gestoria: number;
    lawyer: number;
    valuation: number;
    bankFees: number;
    buyerAgent: number;
    lifeInsurance: number;
    other: number;
  };
  feesTotal: number;
  /** alle Kaufnebenkosten inkl. Steuern */
  ancillary: number;
  renovation: number;
  totalInvestment: number;
}

export function purchaseCosts(i: Inputs): PurchaseBreakdown {
  const p = i.purchase;
  const renovation = i.renovation.items.reduce((s, it) => s + (it.amount || 0), 0);
  const zeroFees = { notary: 0, gestoria: 0, lawyer: 0, valuation: 0, bankFees: 0, buyerAgent: 0, lifeInsurance: 0, other: 0 };

  if (p.costMode === 'quick') {
    const ancillary = p.price * pct(p.quickCostsPct);
    return {
      price: p.price, itp: 0, iva: 0, ajd: 0, taxes: 0, fees: zeroFees, feesTotal: 0,
      ancillary, renovation, totalInvestment: p.price + ancillary + renovation,
    };
  }

  const itp = p.propertyType === 'used' ? p.price * pct(p.itpPct) : 0;
  const iva = p.propertyType === 'new' ? p.price * pct(p.ivaPct) : 0;
  const ajd = p.propertyType === 'new' ? p.price * pct(p.ajdPct) : 0;
  const fees = {
    notary: p.notary, gestoria: p.gestoria, lawyer: p.lawyer, valuation: p.valuation,
    bankFees: p.bankFees, buyerAgent: p.buyerAgent, lifeInsurance: p.lifeInsurance, other: p.other,
  };
  const feesTotal = Object.values(fees).reduce((s, v) => s + (v || 0), 0);
  const taxes = itp + iva + ajd;
  const ancillary = taxes + feesTotal;
  return { price: p.price, itp, iva, ajd, taxes, fees, feesTotal, ancillary, renovation, totalInvestment: p.price + ancillary + renovation };
}

// ---------------------------------------------------------------- Abschreibung

export interface Depreciation {
  /** Kaufpreis + Kaufsteuern und -nebenkosten (ohne Finanzierungskosten) */
  acquisitionCost: number;
  landShare: number;
  /** Anschaffungskosten ohne Bodenanteil */
  buildingFromCost: number;
  /** maßgeblich: der höhere Wert aus Anschaffungskosten und Katasterwert, je ohne Boden */
  building: number;
  renovation: number;
  base: number;
  /** volle Jahresabschreibung ohne spätere Investitionen */
  annual: number;
}

export function depreciation(i: Inputs, purchase = purchaseCosts(i)): Depreciation {
  const x = i.tax;
  const f = purchase.fees;
  const acquisitionCost = i.purchase.costMode === 'quick'
    ? purchase.price + purchase.ancillary
    : purchase.price + purchase.taxes + f.notary + f.gestoria + f.lawyer + f.buyerAgent + f.other;
  const cadastral = x.cadastralLand + x.cadastralBuilding;
  const landShare = cadastral > 0 ? x.cadastralLand / cadastral : Math.min(1, Math.max(0, pct(x.landPct)));
  const buildingFromCost = acquisitionCost * (1 - landShare);
  const building = Math.max(buildingFromCost, x.cadastralBuilding);
  const base = building + purchase.renovation;
  return { acquisitionCost, landShare, buildingFromCost, building, renovation: purchase.renovation, base, annual: base * DEPRECIATION_RATE };
}

// ---------------------------------------------------------------- Kapital & Kredit

export interface Capital {
  totalInvestment: number;
  loan: number;
  equity: number;
  /** Anteil Fremdkapital an der Gesamtinvestition */
  debtRatio: number;
  equityRatio: number;
}

export function loanAmount(i: Inputs): number {
  const f = i.financing;
  if (!f.enabled) return 0;
  return Math.max(0, f.amountMode === 'eur' ? f.amount : i.purchase.price * pct(f.amountPct));
}

export function capital(i: Inputs, purchase = purchaseCosts(i)): Capital {
  const loan = loanAmount(i);
  const ti = purchase.totalInvestment;
  return {
    totalInvestment: ti,
    loan,
    equity: ti - loan,
    debtRatio: ti > 0 ? loan / ti : 0,
    equityRatio: ti > 0 ? (ti - loan) / ti : 0,
  };
}

export function schedule(i: Inputs): LoanSchedule {
  const f = i.financing;
  return buildSchedule({
    amount: loanAmount(i),
    repayment: f.repayment,
    termMode: f.termMode,
    termYears: f.termYears,
    targetPct: f.targetPct,
    targetYears: f.targetYears,
    rateForYear: rateFunction(f),
  });
}

// ---------------------------------------------------------------- Jahreswerte

export interface CostBreakdown {
  management: number;
  maintenance: number;
  community: number;
  ibi: number;
  waste: number;
  insurance: number;
  reserve: number;
  nonRecoverable: number;
  taxAdvice: number;
  other: number;
}
export type CostKey = keyof CostBreakdown;
export const COST_KEYS: CostKey[] = [
  'management', 'maintenance', 'community', 'ibi', 'waste', 'insurance', 'reserve', 'nonRecoverable', 'taxAdvice', 'other',
];

export interface YearRow {
  year: number;
  /** 1 = volles Jahr, < 1 = angebrochenes letztes Jahr */
  fraction: number;
  monthlyRent: number;
  /** Monate mit Miete in diesem Jahr (ohne Anlaufzeit am Anfang) */
  rentedMonths: number;
  potentialRent: number;
  vacancyLoss: number;
  effectiveRent: number;
  costs: CostBreakdown;
  opCosts: number;
  noi: number;
  interest: number;
  principal: number;
  debtService: number;
  /** Amortización, anteilig nach vermieteten Monaten */
  depreciation: number;
  /** Mieteinnahmen − abzugsfähige Kosten − Zinsen − Abschreibung (kann negativ sein) */
  taxBase: number;
  tax: number;
  /** Steuer ohne Zinsabzug (für die GK-Rendite) */
  taxUnlevered: number;
  capex: number;
  cashflow: number;
  cumCashflow: number;
  balance: number;
  propertyValue: number;
  equityInProperty: number;
  ekReturn: number | null;
  gkReturn: number | null;
  cashOnCash: number | null;
  dscr: number | null;
}

export interface RowOptions {
  valueGrowthPct: number;
  /** ersetzt die Monatsmiete in Jahr 1 (für die Break-even-Suche) */
  rentOverride?: number;
  /** Anlaufzeit ohne Miete ignorieren (Kennzahlen eines eingeschwungenen Jahres) */
  ignoreStartDelay?: boolean;
}

/** Kosten, die steuerlich nicht abzugsfähig sind (Rücklage: erst bei tatsächlicher Ausgabe). */
const NON_DEDUCTIBLE: CostKey[] = ['reserve'];

export function vacancyRate(i: Inputs): number {
  const r = i.rental;
  const v = r.vacancyMode === 'pct' ? pct(r.vacancyPct) : r.vacancyMonths / 12;
  return Math.min(1, Math.max(0, v));
}

export function computeRows(
  i: Inputs,
  horizon: number,
  opts: RowOptions,
  sched = schedule(i),
  cap = capital(i),
): YearRow[] {
  const r = i.rental;
  const gRent = pct(r.growthMode === 'single' ? r.growthPct : r.rentGrowthPct);
  const gCost = pct(r.growthMode === 'single' ? r.growthPct : r.costGrowthPct);
  const vac = vacancyRate(i);
  const taxRate = !i.excelLogic && i.tax.rentalTaxEnabled ? pct(i.tax.rentalTaxPct) : 0;
  // Die Reducción gibt es nur im IRPF (Residenten), nicht im IRNR.
  const taxFactor = taxRate * (1 - (i.tax.nonResident ? 0 : Math.min(1, Math.max(0, pct(i.tax.rentalReductionPct)))));
  const delay = opts.ignoreStartDelay ? 0 : Math.max(0, r.startDelayMonths);
  const depAnnual = i.excelLogic ? 0 : depreciation(i).annual;
  const price = i.purchase.price;

  const rows: YearRow[] = [];
  const nYears = Math.max(1, Math.ceil(horizon - 1e-9));
  let monthly = 0;
  let cum = 0;
  let laterBase = 0;

  for (let y = 1; y <= nYears; y++) {
    const frac = Math.min(1, horizon - (y - 1));
    const manual = r.manualRent[y - 1];
    if (y === 1) monthly = opts.rentOverride ?? (manual != null ? manual : r.monthlyRent);
    else monthly = manual != null ? manual : monthly * (1 + gRent);
    if (!r.enabled) monthly = 0;

    const startMonth = (y - 1) * 12;
    const monthsInYear = frac * 12;
    const rentedMonths = r.enabled ? Math.max(0, Math.min(monthsInYear, startMonth + monthsInYear - delay)) : 0;
    const rentedShare = monthsInYear > 0 ? rentedMonths / monthsInYear : 0;

    const potentialRent = monthly * rentedMonths;
    const effectiveRent = potentialRent * (1 - vac);
    const cf = Math.pow(1 + gCost, y - 1) * frac;
    const costs: CostBreakdown = {
      management: effectiveRent * pct(r.managementPct),
      maintenance: effectiveRent * pct(r.maintenancePct),
      community: r.communityMonthly * 12 * cf,
      ibi: r.ibi * cf,
      waste: r.waste * cf,
      insurance: r.insurance * cf,
      reserve: r.reserve * cf,
      nonRecoverable: r.nonRecoverable * cf,
      taxAdvice: r.taxAdvice * cf,
      other: r.other * cf,
    };
    const opCosts = COST_KEYS.reduce((s, k) => s + costs[k], 0);
    const noi = effectiveRent - opCosts;

    const endMonth = Math.round(startMonth + monthsInYear);
    const { interest, principal } = sumMonths(sched, startMonth + 1, endMonth);
    const balance = balanceAfter(sched, endMonth);

    const capex = i.renovation.later.filter((l) => l.year === y).reduce((s, l) => s + (l.amount || 0), 0);
    laterBase += capex;
    // Abzugsfähig nur, was auf die vermieteten Monate entfällt; Agentur und Instandhaltung hängen schon an der Miete.
    const fixedDeductible = COST_KEYS
      .filter((k) => k !== 'management' && k !== 'maintenance' && !NON_DEDUCTIBLE.includes(k))
      .reduce((s, k) => s + costs[k], 0);
    const deductible = costs.management + costs.maintenance + fixedDeductible * rentedShare;
    const dep = i.excelLogic ? 0 : (depAnnual + laterBase * DEPRECIATION_RATE) * (rentedMonths / 12);
    const taxBaseUnlevered = effectiveRent - deductible - dep;
    const taxBase = taxBaseUnlevered - interest * rentedShare;
    const tax = taxFactor * Math.max(0, taxBase);
    const taxUnlevered = taxFactor * Math.max(0, taxBaseUnlevered);
    // Excel-Logik: Tilgung wird nicht abgezogen
    const cashflow = i.excelLogic ? noi - interest - capex : noi - interest - principal - tax - capex;
    cum += cashflow;

    const t = y - 1 + frac;
    const propertyValue = price * Math.pow(1 + pct(opts.valueGrowthPct), t);
    const debtService = interest + principal;
    rows.push({
      year: y, fraction: frac, monthlyRent: monthly, rentedMonths, potentialRent, vacancyLoss: potentialRent - effectiveRent, effectiveRent,
      costs, opCosts, noi, interest, principal, debtService, depreciation: dep, taxBase, tax, taxUnlevered, capex, cashflow, cumCashflow: cum,
      balance, propertyValue, equityInProperty: propertyValue - balance,
      ekReturn: safeDiv(noi - interest - tax, cap.equity * frac),
      gkReturn: safeDiv(noi - taxUnlevered, cap.totalInvestment * frac),
      cashOnCash: safeDiv(cashflow, cap.equity * frac),
      dscr: debtService > 0 ? noi / debtService : null,
    });
  }
  return rows;
}

// ---------------------------------------------------------------- Kennzahlen Jahr 1

export interface BaseKpis {
  purchase: PurchaseBreakdown;
  capital: Capital;
  schedule: LoanSchedule;
  monthlyPayment: number;
  year1: YearRow;
  grossYield: number | null;
  netYield: number | null;
  vacancyRate: number;
  breakEvenRent: number | null;
}

export function year1Cashflow(i: Inputs, rent: number, sched = schedule(i), cap = capital(i)): number {
  return computeRows(i, 1, { valueGrowthPct: 0, rentOverride: rent, ignoreStartDelay: true }, sched, cap)[0].cashflow;
}

/** Monatliche Kaltmiete, bei der der Cashflow in Jahr 1 genau 0 ist. */
export function breakEvenRent(i: Inputs, sched = schedule(i), cap = capital(i)): number | null {
  if (!i.rental.enabled) return null;
  let lo = 0;
  let hi = Math.max(10000, i.rental.monthlyRent * 20);
  if (year1Cashflow(i, lo, sched, cap) >= 0) return 0;
  if (year1Cashflow(i, hi, sched, cap) < 0) return null;
  for (let k = 0; k < 100; k++) {
    const mid = (lo + hi) / 2;
    if (year1Cashflow(i, mid, sched, cap) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function baseKpis(i: Inputs): BaseKpis {
  const purchase = purchaseCosts(i);
  const cap = capital(i, purchase);
  const sched = schedule(i);
  // Laufende Kennzahlen für ein volles Mietjahr; die Anlaufzeit zeigt die Jahrestabelle.
  const year1 = computeRows(i, 1, { valueGrowthPct: 0, ignoreStartDelay: true }, sched, cap)[0];
  return {
    purchase,
    capital: cap,
    schedule: sched,
    monthlyPayment: sched.firstPayment,
    year1,
    grossYield: i.rental.enabled ? safeDiv(i.rental.monthlyRent * 12, i.purchase.price) : null,
    netYield: safeDiv(year1.noi, cap.totalInvestment),
    vacancyRate: vacancyRate(i),
    breakEvenRent: breakEvenRent(i, sched, cap),
  };
}

// ---------------------------------------------------------------- Rechner A: langfristig vermieten

export interface RentResult {
  horizon: number;
  rows: YearRow[];
  /** Jahr (mit Nachkommastellen), in dem die kumulierten Cashflows das EK zurückgezahlt haben */
  paybackYear: number | null;
  totalCashflow: number;
  endValue: number;
  endBalance: number;
  endEquity: number;
  /** Cashflows + Eigenkapitalanteil am Ende − eingesetztes EK (Wert nicht realisiert) */
  totalGain: number;
  irrEquity: number | null;
  irrTotal: number | null;
  multiple: number | null;
  avgNoiOnPrice: number | null;
  avgNoiOnInvestment: number | null;
}

export function defaultHorizon(i: Inputs, sched = schedule(i)): number {
  if (i.rentOnly.horizonYears != null) return Math.min(MAX_YEARS, Math.max(1, i.rentOnly.horizonYears));
  if (i.financing.enabled && sched.months.length > 0) return Math.min(MAX_YEARS, Math.ceil(sched.termMonths / 12 - 1e-9));
  return 20;
}

export function rentCalculator(i: Inputs): RentResult {
  const purchase = purchaseCosts(i);
  const cap = capital(i, purchase);
  const sched = schedule(i);
  const horizon = defaultHorizon(i, sched);
  const rows = computeRows(i, horizon, { valueGrowthPct: i.rentOnly.valueGrowthPct }, sched, cap);
  const last = rows[rows.length - 1];

  let paybackYear: number | null = null;
  if (cap.equity <= 0) paybackYear = 0;
  else {
    let prev = 0;
    for (const row of rows) {
      if (row.cumCashflow >= cap.equity) {
        paybackYear = row.year - 1 + (cap.equity - prev) / (row.cumCashflow - prev);
        break;
      }
      prev = row.cumCashflow;
    }
  }

  const totalCashflow = last.cumCashflow;
  const endEquity = last.propertyValue - last.balance;
  const eqFlows: Flow[] = [{ t: 0, amount: -cap.equity }, ...rows.map((r) => ({ t: r.year - 1 + r.fraction, amount: r.cashflow }))];
  eqFlows[eqFlows.length - 1] = { ...eqFlows[eqFlows.length - 1], amount: eqFlows[eqFlows.length - 1].amount + endEquity };
  const gkFlows: Flow[] = [
    { t: 0, amount: -cap.totalInvestment },
    ...rows.map((r) => ({ t: r.year - 1 + r.fraction, amount: r.noi - r.taxUnlevered - r.capex })),
  ];
  gkFlows[gkFlows.length - 1] = { ...gkFlows[gkFlows.length - 1], amount: gkFlows[gkFlows.length - 1].amount + last.propertyValue };
  const avgNoi = rows.reduce((s, r) => s + r.noi, 0) / horizon;

  return {
    horizon,
    rows,
    paybackYear,
    totalCashflow,
    endValue: last.propertyValue,
    endBalance: last.balance,
    endEquity,
    totalGain: totalCashflow + endEquity - cap.equity,
    irrEquity: cap.equity > 0 ? irr(eqFlows) : null,
    irrTotal: irr(gkFlows),
    multiple: safeDiv(totalCashflow + endEquity, cap.equity),
    avgNoiOnPrice: safeDiv(avgNoi, i.purchase.price),
    avgNoiOnInvestment: safeDiv(avgNoi, cap.totalInvestment),
  };
}

// ---------------------------------------------------------------- Rechner B: kaufen und verkaufen

export interface SaleResult {
  scenario: ScenarioKey;
  holdYears: number;
  rows: YearRow[];
  salePrice: number;
  agentFee: number;
  prepaymentPenalty: number;
  saleCosts: number;
  balance: number;
  /** wirtschaftlicher Gewinn: Verkaufspreis − Verkaufskosten − Gesamtinvestition − Investitionen */
  capitalGain: number;
  /** Summe der Abschreibungen; mindert die steuerlichen Anschaffungskosten */
  accumulatedDepreciation: number;
  /** steuerpflichtiger Gewinn = Gewinn + Abschreibungen */
  taxableGain: number;
  capitalGainsTax: number;
  netProceeds: number;
  /** 3 %-Einbehalt durch den Käufer bei Nichtresidenten */
  retention: number;
  /** Steuer − Einbehalt: > 0 Nachzahlung, < 0 Erstattung */
  retentionSettlement: number;
  /** Auszahlung beim Notartermin (Liquidität im Verkaufsjahr) */
  cashAtClosing: number;
  sumCashflow: number;
  rentalProfit: number;
  saleProfit: number;
  totalProfit: number;
  irrEquity: number | null;
  irrTotal: number | null;
  multiple: number | null;
  /** Mietgewinn, Verkaufsgewinn und Gesamtgewinn je Jahr in % des Eigenkapitals (ohne Zinseszins) */
  rentalReturnPa: number | null;
  saleReturnPa: number | null;
  profitPerYearOnEquity: number | null;
}

export const SCENARIOS: ScenarioKey[] = ['pessimistic', 'realistic', 'optimistic'];

export function salePrice(i: Inputs, key: ScenarioKey): number {
  const s = i.sale.scenarios[key];
  if (i.sale.priceMode === 'direct') return s.price;
  return i.purchase.price * Math.pow(1 + pct(s.growthPct), i.sale.holdYears);
}

export function saleCalculator(i: Inputs, key: ScenarioKey): SaleResult {
  const purchase = purchaseCosts(i);
  const cap = capital(i, purchase);
  const sched = schedule(i);
  const s = i.sale;
  const hold = Math.min(MAX_YEARS, Math.max(1 / 12, s.holdYears));
  const price = salePrice(i, key);
  const growth = Math.pow(price / Math.max(1, i.purchase.price), 1 / hold) - 1;
  const rows = computeRows(i, hold, { valueGrowthPct: growth * 100 }, sched, cap);

  const balance = balanceAfter(sched, Math.round(hold * 12));
  const agentFee = price * pct(s.agentPct);
  const prepaymentPenalty = i.financing.enabled ? balance * pct(i.financing.prepaymentPenaltyPct) : 0;
  const saleCostsUnlevered = agentFee + s.lawyer + s.plusvalia + s.preparation + s.openCommunity + s.other;
  const saleCosts = saleCostsUnlevered + prepaymentPenalty;
  const capexSum = rows.reduce((sum, r) => sum + r.capex, 0);

  const capitalGain = price - saleCosts - cap.totalInvestment - capexSum;
  const accumulatedDepreciation = rows.reduce((sum, r) => sum + r.depreciation, 0);
  const taxableGain = capitalGain + accumulatedDepreciation;
  const gainsTax = capitalGainsTax(i, taxableGain);
  const netProceeds = price - saleCosts - gainsTax - balance;
  const retention = i.tax.nonResident ? price * NON_RESIDENT_RETENTION : 0;

  const sumCashflow = rows.reduce((sum, r) => sum + r.cashflow, 0);
  const rentalProfit = rows.reduce((sum, r) => sum + r.noi - r.interest - r.tax, 0);
  const saleProfit = capitalGain - gainsTax;
  const totalProfit = rentalProfit + saleProfit;

  const flows: Flow[] = [{ t: 0, amount: -cap.equity }];
  const gkFlows: Flow[] = [{ t: 0, amount: -cap.totalInvestment }];
  for (const r of rows) {
    const t = r.year - 1 + r.fraction;
    // Excel-Logik zieht die Tilgung im Cashflow nicht ab; für den IRR zählt der echte Zahlungsstrom.
    flows.push({ t, amount: r.noi - r.interest - r.principal - r.tax - r.capex });
    gkFlows.push({ t, amount: r.noi - r.taxUnlevered - r.capex });
  }
  flows.push({ t: hold, amount: netProceeds });
  const gkGain = price - saleCostsUnlevered - cap.totalInvestment - capexSum + accumulatedDepreciation;
  gkFlows.push({ t: hold, amount: price - saleCostsUnlevered - capitalGainsTax(i, gkGain) });

  return {
    scenario: key,
    holdYears: hold,
    rows,
    salePrice: price,
    agentFee,
    prepaymentPenalty,
    saleCosts,
    balance,
    capitalGain,
    accumulatedDepreciation,
    taxableGain,
    capitalGainsTax: gainsTax,
    netProceeds,
    retention,
    retentionSettlement: i.tax.nonResident ? gainsTax - retention : 0,
    cashAtClosing: price - retention - saleCosts - balance,
    sumCashflow,
    rentalProfit,
    saleProfit,
    totalProfit,
    irrEquity: cap.equity > 0 ? irr(flows) : null,
    irrTotal: irr(gkFlows),
    multiple: safeDiv(cap.equity + totalProfit, cap.equity),
    rentalReturnPa: safeDiv(rentalProfit / hold, cap.equity),
    saleReturnPa: safeDiv(saleProfit / hold, cap.equity),
    profitPerYearOnEquity: safeDiv(totalProfit / hold, cap.equity),
  };
}

// ---------------------------------------------------------------- Sensitivität

export interface SensitivityRow {
  key: 'rent' | 'rate' | 'price';
  low: number | null;
  base: number | null;
  high: number | null;
}

function shiftRates(i: Inputs, deltaPct: number): Inputs {
  const f = i.financing;
  return {
    ...i,
    financing: {
      ...f,
      fixedRatePct: f.fixedRatePct + deltaPct,
      marginPct: f.marginPct + deltaPct,
    },
  };
}

function scaleRent(i: Inputs, factor: number): Inputs {
  return {
    ...i,
    rental: {
      ...i.rental,
      monthlyRent: i.rental.monthlyRent * factor,
      manualRent: i.rental.manualRent.map((m) => (m == null ? m : m * factor)),
    },
  };
}

function scalePrice(i: Inputs, factor: number): Inputs {
  return { ...i, purchase: { ...i.purchase, price: i.purchase.price * factor } };
}

/** EK-Rendite in Jahr 1 bei Miete ±10 %, Zins ±1 Prozentpunkt, Kaufpreis ±5 %. */
export function sensitivity(i: Inputs): SensitivityRow[] {
  const ek = (x: Inputs) => baseKpis(x).year1.ekReturn;
  const base = ek(i);
  return [
    { key: 'rent', low: ek(scaleRent(i, 0.9)), base, high: ek(scaleRent(i, 1.1)) },
    { key: 'rate', low: ek(shiftRates(i, -1)), base, high: ek(shiftRates(i, 1)) },
    { key: 'price', low: ek(scalePrice(i, 0.95)), base, high: ek(scalePrice(i, 1.05)) },
  ];
}
