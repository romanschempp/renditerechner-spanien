import type { FinancingInputs, Repayment } from './types';

export interface LoanMonth {
  month: number;
  year: number;
  ratePct: number;
  interest: number;
  principal: number;
  payment: number;
  balance: number;
}

export interface LoanYear {
  year: number;
  ratePct: number;
  interest: number;
  principal: number;
  payment: number;
  balance: number;
}

export interface LoanSchedule {
  amount: number;
  /** Laufzeit in Monaten, ggf. mit Nachkommastellen (letzte Rate kleiner) */
  termMonths: number;
  firstPayment: number;
  months: LoanMonth[];
  years: LoanYear[];
}

export interface LoanParams {
  amount: number;
  repayment: Repayment;
  termMode: 'years' | 'target';
  termYears: number;
  targetPct: number;
  targetYears: number;
  /** Jahreszins in % für Kreditjahr y (1-basiert) */
  rateForYear: (year: number) => number;
}

/** Monatsrate eines Annuitätendarlehens; n darf eine Kommazahl sein. */
export function annuityPayment(balance: number, monthlyRate: number, n: number): number {
  if (n <= 0) return balance;
  if (monthlyRate === 0) return balance / n;
  return (balance * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n));
}

/** Jahreszins in % je Kreditjahr aus den Finanzierungseingaben (nie negativ). */
export function rateFunction(f: FinancingInputs): (year: number) => number {
  const euribor = (year: number): number => {
    if (f.euriborMode === 'path' && f.euriborPath.length > 0) {
      return f.euriborPath[Math.min(year, f.euriborPath.length) - 1];
    }
    return f.euriborPct;
  };
  return (year: number) => {
    let r: number;
    if (f.rateType === 'fixed') r = f.fixedRatePct;
    else if (f.rateType === 'variable') r = euribor(year) + f.marginPct;
    else r = year <= f.fixedYears ? f.fixedRatePct : euribor(year) + f.marginPct;
    return Math.max(0, r);
  };
}

/** Laufzeit in Monaten; beim Ziel „X % getilgt nach Y Jahren“ wird sie aus der nötigen Rate errechnet. */
export function resolveTermMonths(p: LoanParams): number {
  if (p.termMode === 'years' || p.repayment === 'bullet') return Math.max(1 / 12, p.termYears) * 12;
  const x = Math.min(1, Math.max(0.0001, p.targetPct / 100));
  const k = Math.max(1, p.targetYears * 12);
  if (x >= 1) return k;
  if (p.repayment === 'linear') return k / x;
  const r = p.rateForYear(1) / 1200;
  if (r === 0) return k / x;
  const g = Math.pow(1 + r, k);
  const payment = (p.amount * (g - (1 - x)) * r) / (g - 1);
  return -Math.log(1 - (p.amount * r) / payment) / Math.log(1 + r);
}

export function buildSchedule(p: LoanParams): LoanSchedule {
  const n = resolveTermMonths(p);
  const months: LoanMonth[] = [];
  let balance = p.amount;
  let payment = 0;
  let lastRate = NaN;
  const linearPrincipal = p.amount / n;
  const maxMonths = Math.ceil(n - 1e-9);

  for (let m = 1; m <= maxMonths && balance > 1e-7; m++) {
    const year = Math.ceil(m / 12);
    const ratePct = p.rateForYear(year);
    const r = ratePct / 1200;
    const remaining = n - (m - 1);
    const isLast = remaining <= 1 + 1e-9;
    const interest = balance * r;
    let principal: number;

    if (p.repayment === 'annuity') {
      // Bei Zinsänderung wird die Rate auf Restschuld und Restlaufzeit neu berechnet.
      if (ratePct !== lastRate) payment = annuityPayment(balance, r, remaining);
      principal = isLast ? balance : Math.min(balance, payment - interest);
    } else if (p.repayment === 'linear') {
      principal = isLast ? balance : Math.min(balance, linearPrincipal);
    } else {
      principal = isLast ? balance : 0;
    }
    lastRate = ratePct;
    balance -= principal;
    if (Math.abs(balance) < 1e-7) balance = 0;
    months.push({ month: m, year, ratePct, interest, principal, payment: interest + principal, balance });
  }

  const years: LoanYear[] = [];
  for (const mo of months) {
    let y = years[mo.year - 1];
    if (!y) {
      y = { year: mo.year, ratePct: 0, interest: 0, principal: 0, payment: 0, balance: 0 };
      years.push(y);
    }
    y.interest += mo.interest;
    y.principal += mo.principal;
    y.payment += mo.payment;
    y.balance = mo.balance;
  }
  for (const y of years) {
    const ms = months.filter((m) => m.year === y.year);
    y.ratePct = ms.reduce((s, m) => s + m.ratePct, 0) / ms.length;
  }

  return { amount: p.amount, termMonths: n, firstPayment: months[0]?.payment ?? 0, months, years };
}

/** Summen eines Zeitraums [fromMonth, toMonth] (1-basiert, inklusive). */
export function sumMonths(s: LoanSchedule, fromMonth: number, toMonth: number) {
  let interest = 0;
  let principal = 0;
  for (const m of s.months) {
    if (m.month >= fromMonth && m.month <= toMonth) {
      interest += m.interest;
      principal += m.principal;
    }
  }
  return { interest, principal };
}

/** Restschuld nach `month` Monaten. */
export function balanceAfter(s: LoanSchedule, month: number): number {
  if (month <= 0) return s.amount;
  const m = s.months[Math.min(month, s.months.length) - 1];
  return m ? m.balance : s.amount;
}
