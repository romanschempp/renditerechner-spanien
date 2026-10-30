import { useMemo } from 'react';
import {
  COST_KEYS, rentCalculator, saleCalculator, SCENARIOS, sensitivity,
  type BaseKpis, type Inputs, type RentResult, type SaleResult, type YearRow,
} from '../engine';
import { useI18n } from '../i18n';
import type { Calc } from '../state/store';
import { Charts } from './Charts';
import { focusModel } from './focus';
import { InfoTip, Note, Section, Signed } from './ui';

export interface Computed {
  rent: RentResult | null;
  sales: SaleResult[] | null;
}

export function useComputed(inputs: Inputs, calc: Calc): Computed {
  return useMemo(
    () => ({
      rent: calc === 'rent' ? rentCalculator(inputs) : null,
      sales: calc === 'sale' ? SCENARIOS.map((k) => saleCalculator(inputs, k)) : null,
    }),
    [inputs, calc],
  );
}

export function ResultPanel({ inputs, calc, kpis, computed }: { inputs: Inputs; calc: Calc; kpis: BaseKpis; computed: Computed }) {
  const { t, fill, num } = useI18n();
  const sale = computed.sales?.[1] ?? null;
  const rows = calc === 'rent' ? computed.rent!.rows : sale!.rows;
  const sens = useMemo(() => sensitivity(inputs), [inputs]);

  return (
    <div className="results">
      <ReturnFocus calc={calc} kpis={kpis} computed={computed} excel={inputs.excelLogic} />
      {inputs.excelLogic && <Note tone="warn">{t.settings.excelActive}</Note>}
      <Overview kpis={kpis} computed={computed} />

      {calc === 'sale' && computed.sales && (
        <Section id="res.sale" title={fill(t.results.saleTitle, { years: num(sale!.holdYears, sale!.holdYears % 1 ? 1 : 0) })} level="panel">
          <SaleBreakdown sales={computed.sales} equity={kpis.capital.equity} nonResident={inputs.tax.nonResident} />
        </Section>
      )}
      {calc === 'rent' && computed.rent && <WealthBlock rent={computed.rent} />}

      <Section id="res.years" title={t.results.yearTable} level="panel">
        <YearTable rows={rows} excel={inputs.excelLogic} financed={kpis.capital.loan > 0} />
      </Section>
      {kpis.capital.loan > 0 && (
        <Section id="res.loan" title={t.results.loanTable} level="panel">
          <LoanTable kpis={kpis} />
        </Section>
      )}

      <h2 className="group-h">{t.results.charts}</h2>
      <Charts inputs={inputs} calc={calc} kpis={kpis} rows={rows} computed={computed} sens={sens} />

      <ul className="checks checks--foot">
        <li>{t.results.inflationHint}</li>
        <li>{t.results.opportunityHint}</li>
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- Renditefeld

function ReturnFocus({ calc, kpis, computed, excel }: { calc: Calc; kpis: BaseKpis; computed: Computed; excel: boolean }) {
  const i18n = useI18n();
  const { t, eur, pct, fill } = i18n;
  const m = focusModel(i18n, calc, kpis, computed.sales, excel);
  const mode = calc === 'sale' ? `B · ${t.app.calcSale}` : `A · ${t.app.calcRent}`;

  return (
    <section className={`focus focus--${calc}`} aria-labelledby="focus-title">
      <p className="focus__mode">{mode}</p>
      <h2 className="focus__title" id="focus-title">{m.title}</h2>
      <div className="focus__pair">
        {m.items.map((it) => (
          <div key={it.key} className="ret">
            <p className="ret__name">
              <span className="ret__short">{it.short}</span>
              <span className="ret__long">{it.long}</span>
            </p>
            <p className={`ret__value${it.value != null && it.value < 0 ? ' is-neg' : ''}`}>{pct(it.value, 1)}</p>
            {it.range && (
              <p className="ret__range">{fill(t.focus.range, { low: pct(it.range[0], 1), high: pct(it.range[1], 1) })}</p>
            )}
            <p className="ret__what">{it.what}</p>
            <div
              className={`frac${it.fraction ? '' : ' frac--pair'}`}
              aria-label={it.fraction ? `${it.rows[0].label} ÷ ${it.rows[1].label}` : undefined}
            >
              <span className="frac__row"><span>{it.rows[0].label}</span><b>{eur(it.rows[0].value)}</b></span>
              <span className="frac__row frac__row--den">
                <span>{it.fraction ? `÷ ${it.rows[1].label}` : it.rows[1].label}</span>
                <b className={!it.fraction && it.rows[1].value < 0 ? 'is-neg' : undefined}>{eur(it.rows[1].value)}</b>
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="focus__foot">
        <p>{m.lever}</p>
        <p>
          {m.footLabel}
          <b className={m.footValue < 0 ? 'is-neg' : undefined}>{eur(m.footValue)}</b>
        </p>
        {m.year1Note && <p className="focus__year1">{m.year1Note}</p>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Übersicht

interface Row {
  key: string;
  label: string;
  value: string;
  note?: string;
  sign?: number | null;
  info?: string;
}

function Overview({ kpis, computed }: { kpis: BaseKpis; computed: Computed }) {
  const { t, eur, pct, fill, num } = useI18n();
  const y = kpis.year1;
  const cap = kpis.capital;
  const rent = computed.rent;
  const sale = computed.sales?.[1];
  const years = rent ? rent.horizon : sale!.holdYears;
  const yearsTxt = num(years, years % 1 ? 1 : 0);
  const join = (...xs: (string | undefined)[]) => xs.filter(Boolean).join(' ') || undefined;

  const capital: Row[] = [
    { key: 'ti', label: t.kpi.totalInvestment, value: eur(cap.totalInvestment), info: fill(t.kpi.totalInvestmentSub, { price: eur(kpis.purchase.price) }) },
    { key: 'eq', label: t.kpi.equity, value: eur(cap.equity), note: pct(cap.equityRatio, 0) },
    ...(cap.loan > 0
      ? [
          { key: 'loan', label: t.overview.loan, value: eur(cap.loan), note: pct(cap.debtRatio, 0) },
          { key: 'rate', label: t.kpi.loanPayment, value: eur(kpis.monthlyPayment), note: t.units.perMonthShort, info: t.kpi.loanPaymentSub },
        ]
      : []),
  ];

  const year1: Row[] = [
    { key: 'cfm', label: t.kpi.cashflow, value: eur(y.cashflow / 12), note: t.units.perMonthShort, sign: y.cashflow, info: fill(t.kpi.cashflowSub, { year: eur(y.cashflow) }) },
    { key: 'costs', label: t.kpi.costs, value: eur(y.opCosts), info: t.kpi.costsSub },
    { key: 'gross', label: t.kpi.grossYield, value: pct(kpis.grossYield), info: t.kpi.grossYieldSub },
    { key: 'net', label: t.kpi.netYield, value: pct(kpis.netYield), info: t.kpi.netYieldSub },
    { key: 'coc', label: t.kpi.cashOnCash, value: pct(y.cashOnCash), sign: y.cashOnCash, info: t.kpi.cashOnCashSub },
    ...(cap.loan > 0
      ? [{ key: 'dscr', label: t.kpi.dscr, value: y.dscr == null ? '–' : num(y.dscr, 2), sign: y.dscr == null ? null : y.dscr - 1, info: t.kpi.dscrSub }]
      : []),
    { key: 'be', label: t.kpi.breakEven, value: kpis.breakEvenRent == null ? '–' : eur(kpis.breakEvenRent), note: t.units.perMonthShort, info: t.kpi.breakEvenSub },
    { key: 'vac', label: t.kpi.vacancy, value: pct(kpis.vacancyRate, 1) },
  ];

  const horizon: Row[] = [];
  if (sale) {
    horizon.push(
      { key: 'profit', label: t.kpi.profit, value: eur(sale.totalProfit), sign: sale.totalProfit, info: join(fill(t.kpi.profitSubSale, { years: yearsTxt }) + '.', t.results.inflationHint) },
      { key: 'rpa', label: t.results.rentalReturnPa, value: pct(sale.rentalReturnPa), sign: sale.rentalReturnPa, info: t.results.returnsPaHint },
      { key: 'spa', label: t.results.saleReturnPa, value: pct(sale.saleReturnPa), sign: sale.saleReturnPa, info: t.results.returnsPaHint },
      { key: 'tpa', label: t.results.totalReturnPa, value: pct(sale.profitPerYearOnEquity), sign: sale.profitPerYearOnEquity, info: t.results.returnsPaHint },
      { key: 'irr', label: t.kpi.irr, value: pct(sale.irrEquity), sign: sale.irrEquity, info: join(t.kpi.irrSub + '.', t.results.irrHint) },
      { key: 'irrgk', label: t.kpi.irrTotal, value: pct(sale.irrTotal), sign: sale.irrTotal, info: join(t.kpi.irrTotalSub + '.', t.results.opportunityHint) },
      { key: 'mult', label: t.kpi.multiple, value: sale.multiple == null ? '–' : `${num(sale.multiple, 2)}×` },
    );
  }
  if (rent) {
    horizon.push(
      { key: 'profit', label: t.kpi.profit, value: eur(rent.totalGain), sign: rent.totalGain, info: join(fill(t.kpi.profitSubRent, { years: yearsTxt }) + '.', t.results.inflationHint) },
      { key: 'irr', label: t.kpi.irr, value: pct(rent.irrEquity), sign: rent.irrEquity, info: join(t.kpi.irrSub + '.', t.results.rentIrrHint) },
      { key: 'irrgk', label: t.kpi.irrTotal, value: pct(rent.irrTotal), sign: rent.irrTotal, info: join(t.kpi.irrTotalSub + '.', t.results.opportunityHint) },
      { key: 'mult', label: t.kpi.multiple, value: rent.multiple == null ? '–' : `${num(rent.multiple, 2)}×` },
      {
        key: 'payback', label: t.kpi.payback,
        value: rent.paybackYear == null ? `> ${rent.horizon} ${t.units.years}` : fill(t.kpi.paybackValue, { year: num(rent.paybackYear, 1) }),
        info: t.kpi.paybackSub,
      },
      { key: 'onprice', label: t.kpi.onPrice, value: pct(rent.avgNoiOnPrice) },
      { key: 'oninv', label: t.kpi.onInvestment, value: pct(rent.avgNoiOnInvestment) },
    );
  }

  const groups = [
    { key: 'cap', title: t.overview.capital, rows: capital },
    { key: 'y1', title: t.overview.year1, rows: year1 },
    { key: 'hz', title: fill(t.overview.horizon, { years: yearsTxt }), rows: horizon },
  ];

  return (
    <div className="overview" aria-label={t.results.keyFigures}>
      {groups.map((g) => (
        <section key={g.key} className={`ledger${g.key === 'hz' ? ' ledger--wide' : ''}`}>
          <h3 className="ledger__h">{g.title}</h3>
          <dl className="ledger__list">
            {g.rows.map((r) => (
              <div key={r.key} className="ledger__row">
                <dt>
                  {r.label}
                  {r.info && <InfoTip text={r.info} />}
                </dt>
                <dd>
                  <Signed value={r.sign}>{r.value}</Signed>
                  {r.note && <small>{r.note}</small>}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Verkauf

function SaleBreakdown({ sales, equity, nonResident }: { sales: SaleResult[]; equity: number; nonResident: boolean }) {
  const { t, eur, pct } = useI18n();
  type Line = { label: string; get: (s: SaleResult) => number | null; fmt?: 'pct'; strong?: boolean; sign?: boolean; info?: string; neg?: boolean };
  const lines: Line[] = [
    { label: t.results.salePrice, get: (s) => s.salePrice },
    { label: t.results.saleCosts, get: (s) => -s.saleCosts, neg: true },
    ...(sales[1].prepaymentPenalty > 0 ? [{ label: t.results.prepayment, get: (s: SaleResult) => -s.prepaymentPenalty, neg: true }] : []),
    { label: t.results.capitalGainsTax, get: (s) => -s.capitalGainsTax, neg: true, info: t.tax.gainsNote },
    { label: t.results.balance, get: (s) => -s.balance, neg: true },
    { label: t.results.netProceeds, get: (s) => s.netProceeds, strong: true },
    { label: t.results.sumCashflow, get: (s) => s.sumCashflow, sign: true },
    { label: t.results.equityIn, get: () => -equity, neg: true },
    { label: t.results.totalProfit, get: (s) => s.totalProfit, strong: true, sign: true },
    { label: t.results.saleProfit, get: (s) => s.saleProfit, sign: true, info: t.results.saleProfitHint },
    { label: t.results.rentalProfit, get: (s) => s.rentalProfit, sign: true, info: t.results.rentalProfitHint },
    { label: t.results.capitalGain, get: (s) => s.capitalGain, sign: true },
    ...(sales[1].accumulatedDepreciation > 0
      ? [
          { label: t.results.accumulatedDepreciation, get: (s: SaleResult) => s.accumulatedDepreciation, info: t.results.accumulatedDepreciationHint },
          { label: t.results.taxableGain, get: (s: SaleResult) => s.taxableGain, sign: true },
        ]
      : []),
    { label: t.results.rentalReturnPa, get: (s) => s.rentalReturnPa, fmt: 'pct', sign: true, info: t.results.returnsPaHint },
    { label: t.results.saleReturnPa, get: (s) => s.saleReturnPa, fmt: 'pct', sign: true, info: t.results.returnsPaHint },
    { label: t.results.totalReturnPa, get: (s) => s.profitPerYearOnEquity, fmt: 'pct', sign: true, strong: true, info: t.results.returnsPaHint },
    { label: t.kpi.irr, get: (s) => s.irrEquity, fmt: 'pct', sign: true },
    { label: t.kpi.irrTotal, get: (s) => s.irrTotal, fmt: 'pct', sign: true },
  ];
  if (nonResident) {
    lines.push(
      { label: t.results.retention, get: (s) => -s.retention, neg: true, info: t.tax.nonResidentHint },
      { label: t.results.cashAtClosing, get: (s) => s.cashAtClosing, strong: true, info: t.results.liquidityNote },
      { label: t.results.retentionSettlement, get: (s) => s.retentionSettlement },
    );
  }
  return (
    <div className="table-wrap">
      <table className="tbl tbl--sale">
        <thead>
          <tr>
            <th scope="col"><span className="sr">{t.results.scenarioTable}</span></th>
            {sales.map((s) => (
              <th key={s.scenario} scope="col" className={`num scen-h scen-h--${s.scenario}`}>{t.sale[s.scenario]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.label} className={l.strong ? 'is-strong' : undefined}>
              <th scope="row">
                {l.label}
                {l.info && <InfoTip text={l.info} />}
              </th>
              {sales.map((s) => {
                const v = l.get(s);
                const txt = l.fmt === 'pct' ? pct(v) : v == null ? '–' : eur(v);
                return (
                  <td key={s.scenario} className={`num${s.scenario === 'realistic' ? ' is-focus' : ''}`}>
                    {l.sign ? <Signed value={v}>{txt}</Signed> : txt}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WealthBlock({ rent }: { rent: RentResult }) {
  const { t, eur, fill } = useI18n();
  return (
    <div className="wealth">
      <h2 className="group-h">{t.results.wealth} · {fill(t.kpi.paybackValue, { year: rent.horizon })}</h2>
      <dl className="wealth__list">
        <div><dt>{t.results.endValue}</dt><dd>{eur(rent.endValue)}</dd></div>
        <div><dt>{t.results.balance}</dt><dd>{eur(-rent.endBalance)}</dd></div>
        <div><dt>{t.results.endEquity}</dt><dd>{eur(rent.endEquity)}</dd></div>
        <div><dt>{t.results.sumCashflow}</dt><dd><Signed value={rent.totalCashflow}>{eur(rent.totalCashflow)}</Signed></dd></div>
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------- Tabellen

function YearTable({ rows, excel, financed }: { rows: YearRow[]; excel: boolean; financed: boolean }) {
  const { t, eur, pct, num } = useI18n();
  type Col = { key: string; label: string; get: (r: YearRow) => number | null; fmt?: 'pct' | 'x'; sign?: boolean; strong?: boolean };
  const costCols: Col[] = COST_KEYS.filter((k) => rows.some((r) => Math.abs(r.costs[k]) > 0.005)).map((k) => ({
    key: k, label: t.table[k], get: (r: YearRow) => -r.costs[k],
  }));
  const cols: Col[] = [
    { key: 'pot', label: t.table.potentialRent, get: (r) => r.potentialRent },
    { key: 'vac', label: t.table.vacancyLoss, get: (r) => -r.vacancyLoss },
    { key: 'eff', label: t.table.effectiveRent, get: (r) => r.effectiveRent, strong: true },
    ...costCols,
    { key: 'op', label: t.table.opCosts, get: (r) => -r.opCosts },
    { key: 'noi', label: t.table.noi, get: (r) => r.noi, strong: true, sign: true },
    ...(financed
      ? [
          { key: 'int', label: t.table.interest, get: (r: YearRow) => -r.interest },
          { key: 'pri', label: t.table.principal, get: (r: YearRow) => -r.principal },
        ]
      : []),
    ...(excel
      ? []
      : [
          { key: 'dep', label: t.table.depreciation, get: (r: YearRow) => -r.depreciation },
          { key: 'tb', label: t.table.taxBase, get: (r: YearRow) => r.taxBase },
        ]),
    { key: 'tax', label: t.table.tax, get: (r) => -r.tax },
    ...(rows.some((r) => r.capex > 0) ? [{ key: 'capex', label: t.table.capex, get: (r: YearRow) => -r.capex }] : []),
    { key: 'cf', label: excel ? t.table.excelYield : t.table.cashflow, get: (r) => r.cashflow, strong: true, sign: true },
    { key: 'cum', label: t.table.cumCashflow, get: (r) => r.cumCashflow, sign: true },
    ...(financed ? [{ key: 'bal', label: t.table.balance, get: (r: YearRow) => r.balance }] : []),
    { key: 'val', label: t.table.propertyValue, get: (r) => r.propertyValue },
    { key: 'eqp', label: t.table.equityInProperty, get: (r) => r.equityInProperty },
    { key: 'ek', label: t.table.ekReturn, get: (r) => r.ekReturn, fmt: 'pct', sign: true },
    ...(financed ? [{ key: 'dscr', label: t.table.dscr, get: (r: YearRow) => r.dscr, fmt: 'x' as const }] : []),
  ];

  return (
    <div className="table-wrap table-wrap--scroll" tabIndex={0}>
      <table className="tbl tbl--years">
        <thead>
          <tr>
            <th scope="col" className="sticky-col">{t.common.year}</th>
            {rows.map((r) => (
              <th key={r.year} scope="col" className="num">
                {r.year}
                {r.fraction < 1 && <span className="frac"> ({num(r.fraction * 12, 0)} {t.units.monthsShort})</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cols.map((c) => (
            <tr key={c.key} className={c.strong ? 'is-strong' : undefined}>
              <th scope="row" className="sticky-col">{c.label}</th>
              {rows.map((r) => {
                const v = c.get(r);
                const txt = v == null ? '–' : c.fmt === 'pct' ? pct(v, 1) : c.fmt === 'x' ? num(v, 2) : eur(v);
                return (
                  <td key={r.year} className="num">
                    {c.sign ? <Signed value={v}>{txt}</Signed> : txt}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LoanTable({ kpis }: { kpis: BaseKpis }) {
  const { t, eur, pct } = useI18n();
  return (
    <div className="table-wrap table-wrap--scroll" tabIndex={0}>
      <table className="tbl tbl--loan">
        <thead>
          <tr>
            <th scope="col">{t.common.year}</th>
            <th scope="col" className="num">{t.table.rate}</th>
            <th scope="col" className="num">{t.table.interest}</th>
            <th scope="col" className="num">{t.table.principal}</th>
            <th scope="col" className="num">{t.table.payment}</th>
            <th scope="col" className="num">{t.table.payment}{t.units.perMonthShort}</th>
            <th scope="col" className="num">{t.table.balance}</th>
          </tr>
        </thead>
        <tbody>
          {kpis.schedule.years.map((y) => {
            const months = kpis.schedule.months.filter((m) => m.year === y.year).length;
            return (
              <tr key={y.year}>
                <th scope="row">{y.year}</th>
                <td className="num">{pct(y.ratePct / 100, 2)}</td>
                <td className="num">{eur(y.interest)}</td>
                <td className="num">{eur(y.principal)}</td>
                <td className="num">{eur(y.payment)}</td>
                <td className="num">{eur(y.payment / months, 2)}</td>
                <td className="num">{eur(y.balance)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">{t.common.total}</th>
            <td />
            <td className="num">{eur(kpis.schedule.years.reduce((s, y) => s + y.interest, 0))}</td>
            <td className="num">{eur(kpis.schedule.years.reduce((s, y) => s + y.principal, 0))}</td>
            <td className="num">{eur(kpis.schedule.years.reduce((s, y) => s + y.payment, 0))}</td>
            <td />
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
