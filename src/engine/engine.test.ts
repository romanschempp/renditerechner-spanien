import { describe, expect, it } from 'vitest';
import {
  baseKpis, blai30, buildSchedule, capital, irr, purchaseCosts, rentCalculator, saleCalculator,
  schedule, sensitivity, type Inputs,
} from './index';

const near = (actual: number, expected: number, tol: number) =>
  expect(Math.abs(actual - expected), `${actual} ≠ ${expected} (±${tol})`).toBeLessThanOrEqual(tol);

function excelInputs(): Inputs {
  const i = blai30();
  i.excelLogic = true;
  return i;
}

describe('Abgleich mit der Excel „Simulación Blai 30“', () => {
  const i = excelInputs();
  const k = baseKpis(i);

  it('Gesamtkosten und Eigenkapital', () => {
    const p = purchaseCosts(i);
    near(p.itp, 26290, 1);
    near(p.renovation, 26747, 1);
    near(p.totalInvestment, 328069.75, 1);
    near(k.capital.equity, 148069.75, 1);
  });

  it('Kredit: Rate, Zinsen und Restschuld Jahr 1', () => {
    near(k.monthlyPayment, 1012, 1);
    near(k.schedule.years[0].interest, 4822, 10);
    // Die Bank-Tabelle der Excel ist in sich nicht stimmig: Jahr 1 „Amortizado“ 7.334 €
    // ergibt 180.000 − 7.334 = 172.666 €, „Pendiente de pago“ zeigt aber 172.641 € (−25 €).
    // Außerdem rundet die Bank die Rate auf 1.013 € auf. Geprüft wird deshalb gegen die
    // getilgte Summe (±5 €) und gegen 172.641 € mit der dokumentierten Abweichung (±30 €).
    near(180000 - k.schedule.years[0].principal, 180000 - 7334, 5);
    near(k.schedule.years[0].balance, 172641, 30);
    // Zinsen der Jahre 1–10 laut Excel-Zeile 31
    [4822, 4620, 4411, 4199, 3977, 3751, 3519, 3282, 3035, 2784].forEach((z, idx) =>
      near(k.schedule.years[idx].interest, z, 10),
    );
  });

  it('Ertrag und Rendite auf EK im Jahr 1', () => {
    const y = k.year1;
    near(y.effectiveRent, 18950.4, 1);
    near(y.costs.management + y.costs.community + y.costs.ibi + y.costs.maintenance, 3514.05, 1);
    near(y.tax, 0, 0);
    near(y.cashflow, 10614.35, 10); // Ertrag = NOI − Zinsen, Tilgung nicht abgezogen
    near(y.noi - 4822, 10614.35, 1);
    near((y.ekReturn ?? 0) * 100, 7.17, 0.01);
  });

  it('Verkauf: Netto, Bruttogewinn und Gewinn nach Steuern', () => {
    const s = saleCalculator(i, 'realistic');
    near(s.salePrice, 390000, 0);
    near(s.salePrice - s.saleCosts, 377750, 1);
    near(s.capitalGain, 49680.25, 1);
    near(s.saleProfit, 39247.4, 1);
  });
});

describe('Kredit', () => {
  const rate = (r: number) => () => r;

  it('Annuität: konstante Rate, vollständig getilgt', () => {
    const s = buildSchedule({ amount: 100000, repayment: 'annuity', termMode: 'years', termYears: 10, targetPct: 0, targetYears: 0, rateForYear: rate(3) });
    expect(s.months).toHaveLength(120);
    near(s.firstPayment, 965.61, 0.01);
    near(s.months[119].payment, 965.61, 0.01);
    near(s.months[119].balance, 0, 1e-6);
    near(s.years.reduce((a, y) => a + y.principal, 0), 100000, 1e-6);
  });

  it('Annuität mit 0 % Zins', () => {
    const s = buildSchedule({ amount: 120000, repayment: 'annuity', termMode: 'years', termYears: 10, targetPct: 0, targetYears: 0, rateForYear: rate(0) });
    near(s.firstPayment, 1000, 1e-9);
  });

  it('Ratentilgung: konstante Tilgung, fallende Zinsen', () => {
    const s = buildSchedule({ amount: 120000, repayment: 'linear', termMode: 'years', termYears: 10, targetPct: 0, targetYears: 0, rateForYear: rate(3) });
    near(s.months[0].principal, 1000, 1e-9);
    near(s.months[0].interest, 300, 1e-9);
    near(s.months[1].interest, 297.5, 1e-9);
    near(s.months[119].balance, 0, 1e-6);
  });

  it('Endfällig: nur Zinsen, Tilgung am Ende', () => {
    const s = buildSchedule({ amount: 100000, repayment: 'bullet', termMode: 'years', termYears: 5, targetPct: 0, targetYears: 0, rateForYear: rate(4) });
    near(s.years[0].interest, 4000, 1e-6);
    near(s.years[0].principal, 0, 1e-9);
    near(s.years[4].principal, 100000, 1e-6);
    near(s.years[4].balance, 0, 1e-6);
  });

  it('Ziel „50 % getilgt nach 10 Jahren“ (Annuität)', () => {
    const s = buildSchedule({ amount: 200000, repayment: 'annuity', termMode: 'target', termYears: 0, targetPct: 50, targetYears: 10, rateForYear: rate(3) });
    near(s.years[9].balance, 100000, 0.5);
    expect(s.months[s.months.length - 1].balance).toBe(0);
  });

  it('Ziel „40 % getilgt nach 8 Jahren“ (Ratentilgung)', () => {
    const s = buildSchedule({ amount: 100000, repayment: 'linear', termMode: 'target', termYears: 0, targetPct: 40, targetYears: 8, rateForYear: rate(3) });
    near(s.years[7].balance, 60000, 1e-6);
    near(s.termMonths, 240, 1e-9);
  });

  it('Gemischter Zins: Rate wird nach der Festzinsphase neu berechnet', () => {
    const i = blai30();
    Object.assign(i.financing, { rateType: 'mixed', fixedRatePct: 2, fixedYears: 3, euriborPct: 2.5, marginPct: 1, termYears: 20, amount: 100000 });
    const s = schedule(i);
    expect(s.years[2].ratePct).toBe(2);
    expect(s.years[3].ratePct).toBe(3.5);
    expect(s.months[36].payment).toBeGreaterThan(s.months[35].payment);
    near(s.months[s.months.length - 1].balance, 0, 1e-6);
  });

  it('Variabler Zins mit Euríbor-Verlauf', () => {
    const i = blai30();
    Object.assign(i.financing, { rateType: 'variable', marginPct: 1, euriborMode: 'path', euriborPath: [2, 3, 4] });
    const s = schedule(i);
    expect(s.years[0].ratePct).toBe(3);
    expect(s.years[2].ratePct).toBe(5);
    expect(s.years[10].ratePct).toBe(5);
  });
});

describe('IRR', () => {
  it('einfache Reihe', () => {
    near(irr([{ t: 0, amount: -100 }, { t: 1, amount: 110 }])!, 0.1, 1e-9);
  });
  it('mehrere Zahlungen (Excel IRR -1000, 300, 400, 500 = 8,896 %)', () => {
    near(irr([{ t: 0, amount: -1000 }, { t: 1, amount: 300 }, { t: 2, amount: 400 }, { t: 3, amount: 500 }])!, 0.08896, 1e-5);
  });
  it('unterjährige Zeitpunkte', () => {
    near(irr([{ t: 0, amount: -100 }, { t: 0.5, amount: 110 }])!, 0.21, 1e-9);
  });
  it('kein Vorzeichenwechsel → null', () => {
    expect(irr([{ t: 0, amount: 100 }, { t: 1, amount: 10 }])).toBeNull();
  });
});

describe('Haltedauer mit Nachkommastellen', () => {
  it('2,5 Jahre: letztes Jahr anteilig, Restschuld nach 30 Monaten', () => {
    const i = blai30();
    const s = saleCalculator(i, 'realistic');
    expect(s.rows).toHaveLength(3);
    expect(s.rows[2].fraction).toBe(0.5);
    near(s.rows[2].potentialRent, s.rows[1].monthlyRent * 1.03 * 6, 1e-6);
    near(s.balance, schedule(i).months[29].balance, 1e-9);
  });

  it('Gewinn = Summe Cashflows + Nettoerlös − EK = Mietgewinn + Verkaufsgewinn', () => {
    const i = blai30();
    i.renovation.later.push({ id: 'x', label: 'Sonderumlage', year: 2, amount: 3000 });
    const s = saleCalculator(i, 'realistic');
    const eq = capital(i).equity;
    near(s.sumCashflow + s.netProceeds - eq, s.totalProfit, 1e-6);
  });
});

describe('Finanzierung aus', () => {
  it('EK = Gesamtinvestition, keine Zinsen', () => {
    const i = blai30();
    i.financing.enabled = false;
    const k = baseKpis(i);
    expect(k.capital.loan).toBe(0);
    near(k.capital.equity, k.purchase.totalInvestment, 1e-9);
    expect(k.year1.interest).toBe(0);
    expect(k.year1.dscr).toBeNull();
    near(k.year1.ekReturn!, k.year1.gkReturn!, 1e-12);
  });
});

describe('Weitere Kennzahlen', () => {
  it('Bruttorentabilität nach PDF-Beispiel: 1.200 € bei 250.000 € = 5,76 %', () => {
    const i = blai30();
    i.purchase.price = 250000;
    i.rental.monthlyRent = 1200;
    near(baseKpis(i).grossYield! * 100, 5.76, 1e-9);
  });

  it('Break-even-Miete ergibt Cashflow 0', () => {
    const i = blai30();
    const k = baseKpis(i);
    i.rental.monthlyRent = k.breakEvenRent!;
    near(baseKpis(i).year1.cashflow, 0, 0.01);
  });

  it('Neubau: IVA + AJD statt ITP', () => {
    const i = blai30();
    i.purchase.propertyType = 'new';
    const p = purchaseCosts(i);
    expect(p.itp).toBe(0);
    near(p.iva, 26290, 1e-6);
    near(p.ajd, 262900 * 0.015, 1e-6);
  });

  it('Schnellmodus Kaufnebenkosten', () => {
    const i = blai30();
    i.purchase.costMode = 'quick';
    i.purchase.quickCostsPct = 12;
    near(purchaseCosts(i).ancillary, 31548, 1e-6);
  });

  it('Kredit in % vom Kaufpreis', () => {
    const i = blai30();
    i.financing.amountMode = 'pct';
    i.financing.amountPct = 70;
    near(capital(i).loan, 184030, 1e-6);
  });

  it('Nichtresident: 3 % Einbehalt', () => {
    const i = blai30();
    i.tax.nonResident = true;
    const s = saleCalculator(i, 'realistic');
    near(s.retention, 11700, 1e-6);
    near(s.retentionSettlement, s.capitalGainsTax - 11700, 1e-6);
  });

  it('Szenarien und Wertänderung p. a.', () => {
    const i = blai30();
    i.sale.priceMode = 'growth';
    i.sale.holdYears = 10;
    const pes = saleCalculator(i, 'pessimistic');
    const opt = saleCalculator(i, 'optimistic');
    near(pes.salePrice, 262900 * Math.pow(0.98, 10), 1e-6);
    expect(opt.totalProfit).toBeGreaterThan(pes.totalProfit);
  });

  it('Rechner A: Laufzeit = Kreditlaufzeit, Amortisation und Steuern', () => {
    const i = blai30();
    const r = rentCalculator(i);
    expect(r.horizon).toBe(19);
    expect(r.rows[18].balance).toBeCloseTo(0, 6);
    expect(r.rows[0].tax).toBeGreaterThan(0);
    if (r.paybackYear != null) expect(r.paybackYear).toBeGreaterThan(0);
  });

  it('Sensitivität: höhere Miete → höhere EK-Rendite, höherer Zins → niedrigere', () => {
    const [rent, rate, price] = sensitivity(blai30());
    expect(rent.high!).toBeGreaterThan(rent.base!);
    expect(rate.high!).toBeLessThan(rate.base!);
    expect(price.high!).toBeLessThan(price.base!);
  });
});
