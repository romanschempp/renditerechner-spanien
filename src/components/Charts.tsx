import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { BaseKpis, Inputs, SensitivityRow, YearRow } from '../engine';
import { useI18n } from '../i18n';
import type { Calc } from '../state/store';
import type { Computed } from './Results';
import { Section } from './ui';

const AXIS = { stroke: 'var(--line)', tick: { fill: 'var(--ink-3)', fontSize: 12 }, tickLine: false };
const GRID = <CartesianGrid stroke="var(--grid)" vertical={false} />;
const TIP_STYLE = {
  contentStyle: { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, color: 'var(--ink)' },
  labelStyle: { color: 'var(--ink-2)', fontWeight: 600 },
  itemStyle: { color: 'var(--ink)' },
  cursor: { fill: 'var(--hover)' },
};

/** Achsenbeschriftung kurz: 180 k€, 1,2 Mio. € */
function useCompact() {
  const { num, lang } = useI18n();
  return (v: number) => {
    const a = Math.abs(v);
    if (a >= 1e6) return `${num(v / 1e6, 1)} ${lang === 'es' ? 'M€' : 'Mio. €'}`;
    if (a >= 1e3) return `${num(v / 1e3, a >= 1e4 ? 0 : 1)} k€`;
    return `${num(v, 0)} €`;
  };
}

export function Charts({
  inputs, calc, kpis, rows, computed, sens,
}: {
  inputs: Inputs;
  calc: Calc;
  kpis: BaseKpis;
  rows: YearRow[];
  computed: Computed;
  sens: SensitivityRow[];
}) {
  const { t } = useI18n();
  return (
    <div className="charts">
      <Section id="chart.capital" title={t.charts.capital} level="panel"><CapitalChart kpis={kpis} /></Section>
      <Section id="chart.costs" title={t.charts.costs} level="panel"><CostsChart rows={rows} /></Section>
      <Section id="chart.cashflow" title={t.charts.cashflow} level="panel"><CashflowChart rows={rows} /></Section>
      <Section id="chart.loan" title={t.charts.loan} level="panel"><LoanChart kpis={kpis} /></Section>
      <Section id="chart.wealth" title={t.charts.wealth} level="panel"><WealthChart rows={rows} financed={kpis.capital.loan > 0} start={{ price: kpis.purchase.price, loan: kpis.capital.loan }} /></Section>
      {calc === 'sale' && computed.sales && (
        <Section id="chart.scen" title={t.charts.scenarios} level="panel"><ScenarioChart computed={computed} /></Section>
      )}
      <Section id="chart.sens" title={t.charts.sensitivity} level="panel"><SensitivityChart sens={sens} excel={inputs.excelLogic} /></Section>
    </div>
  );
}

// ---------------------------------------------------------------- Kapitalbedarf

function CapitalChart({ kpis }: { kpis: BaseKpis }) {
  const { t, eur, pct } = useI18n();
  const p = kpis.purchase;
  const total = Math.max(1, p.totalInvestment);
  const bars = [
    [
      { label: t.charts.price, v: p.price, c: 'var(--s1)' },
      { label: t.charts.ancillary, v: p.ancillary, c: 'var(--s2)' },
      { label: t.charts.renovation, v: p.renovation, c: 'var(--s3)' },
    ],
    [
      { label: t.charts.equity, v: Math.max(0, kpis.capital.equity), c: 'var(--eq)' },
      { label: t.charts.debt, v: kpis.capital.loan, c: 'var(--debt)' },
    ],
  ];
  return (
    <div className="pbars">
      {bars.map((segs, i) => (
        <div key={i} className="pbar">
          <div className="pbar__track" role="img" aria-label={segs.map((s) => `${s.label} ${eur(s.v)}`).join(', ')}>
            {segs.filter((s) => s.v > 0).map((s) => (
              <span key={s.label} className="pbar__seg" style={{ flexGrow: s.v, background: s.c }} title={`${s.label}: ${eur(s.v)}`} />
            ))}
          </div>
          <ul className="pbar__legend">
            {segs.map((s) => (
              <li key={s.label}>
                <i className="sw" style={{ background: s.c }} />
                <span>{s.label}</span>
                <b>{eur(s.v)}</b>
                <em>{pct(s.v / total, 1)}</em>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Kosten

function CostsChart({ rows }: { rows: YearRow[] }) {
  const { t, eur } = useI18n();
  const compact = useCompact();
  const main = ['management', 'maintenance', 'community', 'ibi', 'insurance'] as const;
  const data = rows.map((r) => {
    const rest = r.opCosts - main.reduce((s, k) => s + r.costs[k], 0);
    return { year: r.year, ...Object.fromEntries(main.map((k) => [k, r.costs[k]])), rest };
  });
  const series = [...main.map((k, i) => ({ key: k, label: t.table[k], color: `var(--s${i + 1})` })), { key: 'rest', label: t.table.other, color: 'var(--s6)' }]
    .filter((s) => data.some((d) => (d as Record<string, number>)[s.key] > 0.005));
  return (
    <ChartBox>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        {GRID}
        <XAxis dataKey="year" {...AXIS} />
        <YAxis {...AXIS} tickFormatter={compact} width={64} />
        <Tooltip {...TIP_STYLE} formatter={(v: number) => eur(v)} labelFormatter={(y) => `${t.common.year} ${y}`} />
        <Legend wrapperStyle={{ fontSize: 13 }} />
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} stackId="c" fill={s.color} stroke="var(--surface)" strokeWidth={1}
            radius={i === series.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={36} />
        ))}
      </BarChart>
    </ChartBox>
  );
}

// ---------------------------------------------------------------- Cashflow

function CashflowChart({ rows }: { rows: YearRow[] }) {
  const { t, eur } = useI18n();
  const compact = useCompact();
  const data = rows.map((r) => ({ year: r.year, cashflow: r.cashflow, cum: r.cumCashflow }));
  return (
    <ChartBox>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        {GRID}
        <XAxis dataKey="year" {...AXIS} />
        <YAxis {...AXIS} tickFormatter={compact} width={64} />
        <ReferenceLine y={0} stroke="var(--ink-3)" />
        <Tooltip {...TIP_STYLE} formatter={(v: number) => eur(v)} labelFormatter={(y) => `${t.common.year} ${y}`} />
        <Legend wrapperStyle={{ fontSize: 13 }} />
        <Bar dataKey="cashflow" name={t.table.cashflow} radius={[4, 4, 0, 0]} maxBarSize={36} fill="var(--pos)">
          {data.map((d) => (
            <Cell key={d.year} fill={d.cashflow < 0 ? 'var(--neg)' : 'var(--pos)'} />
          ))}
        </Bar>
        <Line dataKey="cum" name={t.table.cumCashflow} stroke="var(--s1)" strokeWidth={2} dot={{ r: 3, strokeWidth: 2, fill: 'var(--surface)' }} />
      </ComposedChart>
    </ChartBox>
  );
}

// ---------------------------------------------------------------- Tilgung

function LoanChart({ kpis }: { kpis: BaseKpis }) {
  const { t, eur } = useI18n();
  const compact = useCompact();
  if (kpis.capital.loan <= 0) return <p className="muted">{t.charts.noLoan}</p>;
  const data = kpis.schedule.years.map((y) => ({ year: y.year, interest: y.interest, principal: y.principal, balance: y.balance }));
  // Zins/Tilgung und Restschuld haben sehr unterschiedliche Größenordnungen: zwei Diagramme mit gemeinsamer Zeitachse.
  return (
    <>
      <ChartBox height={220}>
        <BarChart data={data} syncId="loan" margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          {GRID}
          <XAxis dataKey="year" {...AXIS} />
          <YAxis {...AXIS} tickFormatter={compact} width={64} />
          <Tooltip {...TIP_STYLE} formatter={(v: number) => eur(v)} labelFormatter={(y) => `${t.common.year} ${y}`} />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <Bar dataKey="interest" name={t.table.interest} stackId="l" fill="var(--s2)" stroke="var(--surface)" strokeWidth={1} maxBarSize={36} />
          <Bar dataKey="principal" name={t.table.principal} stackId="l" fill="var(--s1)" stroke="var(--surface)" strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ChartBox>
      <ChartBox height={170}>
        <LineChart data={data} syncId="loan" margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          {GRID}
          <XAxis dataKey="year" {...AXIS} />
          <YAxis {...AXIS} tickFormatter={compact} width={64} />
          <Tooltip {...TIP_STYLE} formatter={(v: number) => eur(v)} labelFormatter={(y) => `${t.common.year} ${y}`} />
          <Line dataKey="balance" name={t.table.balance} stroke="var(--debt)" strokeWidth={2} dot={false} />
        </LineChart>
      </ChartBox>
      <p className="chart-cap">{t.table.balance}</p>
    </>
  );
}

// ---------------------------------------------------------------- Vermögen

function WealthChart({ rows, financed, start }: { rows: YearRow[]; financed: boolean; start: { price: number; loan: number } }) {
  const { t, eur } = useI18n();
  const compact = useCompact();
  const data = [
    { year: 0, value: start.price, balance: start.loan, equity: start.price - start.loan },
    ...rows.map((r) => ({ year: +(r.year - 1 + r.fraction).toFixed(2), value: r.propertyValue, balance: r.balance, equity: r.equityInProperty })),
  ];
  return (
    <ChartBox>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        {GRID}
        <XAxis dataKey="year" {...AXIS} />
        <YAxis {...AXIS} tickFormatter={compact} width={64} />
        <Tooltip {...TIP_STYLE} formatter={(v: number) => eur(v)} labelFormatter={(y) => `${t.common.year} ${y}`} />
        <Legend wrapperStyle={{ fontSize: 13 }} />
        <Line dataKey="value" name={t.table.propertyValue} stroke="var(--s1)" strokeWidth={2} dot={false} />
        {financed && <Line dataKey="balance" name={t.table.balance} stroke="var(--debt)" strokeWidth={2} dot={false} />}
        <Line dataKey="equity" name={t.table.equityInProperty} stroke="var(--eq)" strokeWidth={2} dot={false} />
      </LineChart>
    </ChartBox>
  );
}

// ---------------------------------------------------------------- Szenarien

function ScenarioChart({ computed }: { computed: Computed }) {
  const { t, eur, pct } = useI18n();
  const compact = useCompact();
  const data = computed.sales!.map((s) => ({ name: t.sale[s.scenario], profit: s.totalProfit, irr: (s.irrEquity ?? 0) * 100, key: s.scenario }));
  const pctFmt = (v: number) => pct(v / 100, 0);
  // Zwei getrennte Diagramme statt zweier y-Achsen: Gewinn in €, IRR in %.
  return (
    <div className="grid-charts">
      <div>
        <p className="chart-cap">{t.kpi.profit}</p>
        <ChartBox height={220}>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            {GRID}
            <XAxis dataKey="name" {...AXIS} />
            <YAxis {...AXIS} tickFormatter={compact} width={64} />
            <ReferenceLine y={0} stroke="var(--ink-3)" />
            <Tooltip {...TIP_STYLE} formatter={(v: number) => eur(v)} />
            <Bar dataKey="profit" name={t.kpi.profit} radius={[4, 4, 0, 0]} maxBarSize={56}>
              {data.map((d) => <Cell key={d.key} fill={d.profit < 0 ? 'var(--neg)' : 'var(--pos)'} />)}
            </Bar>
          </BarChart>
        </ChartBox>
      </div>
      <div>
        <p className="chart-cap">{t.kpi.irr}</p>
        <ChartBox height={220}>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            {GRID}
            <XAxis dataKey="name" {...AXIS} />
            <YAxis {...AXIS} tickFormatter={pctFmt} width={48} />
            <ReferenceLine y={0} stroke="var(--ink-3)" />
            <Tooltip {...TIP_STYLE} formatter={(v: number) => pct(v / 100)} />
            <Bar dataKey="irr" name={t.kpi.irr} radius={[4, 4, 0, 0]} maxBarSize={56}>
              {data.map((d) => <Cell key={d.key} fill={d.irr < 0 ? 'var(--neg)' : 'var(--s1)'} />)}
            </Bar>
          </BarChart>
        </ChartBox>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Sensitivität

function SensitivityChart({ sens, excel }: { sens: SensitivityRow[]; excel: boolean }) {
  const { t, pct } = useI18n();
  const labels = { rent: t.charts.rentPm, rate: t.charts.ratePm, price: t.charts.pricePm };
  const base = sens[0].base;
  return (
    <div className="sens">
      <table className="tbl tbl--sens">
        <thead>
          <tr>
            <th scope="col"><span className="sr">{t.table.ekReturn}</span></th>
            <th scope="col" className="num">{t.charts.low}</th>
            <th scope="col" className="num">{t.charts.base}</th>
            <th scope="col" className="num">{t.charts.high}</th>
          </tr>
        </thead>
        <tbody>
          {sens.map((r) => (
            <tr key={r.key}>
              <th scope="row">{labels[r.key]}</th>
              {[r.low, r.base, r.high].map((v, i) => (
                <td key={i} className={`num${i === 1 ? ' is-focus' : ''}`}>
                  <span className={v == null || base == null || i === 1 ? '' : v > base ? 'pos' : v < base ? 'neg' : ''}>{pct(v)}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="tornado" role="img" aria-label={t.charts.sensitivity}>
        {(() => {
          const span = Math.max(1e-6, ...sens.flatMap((r) => [Math.abs((r.low ?? 0) - (base ?? 0)), Math.abs((r.high ?? 0) - (base ?? 0))]));
          return sens.map((r) => {
            const lo = ((r.low ?? 0) - (base ?? 0)) / span;
            const hi = ((r.high ?? 0) - (base ?? 0)) / span;
            const seg = (d: number, k: string, title: string) => (
              <span key={k} className={`tornado__seg ${d < 0 ? 'is-neg' : 'is-pos'}`}
                style={{ width: `${Math.abs(d) * 50}%`, [d < 0 ? 'right' : 'left']: '50%' }} title={title} />
            );
            return (
              <div key={r.key} className="tornado__row">
                <span className="tornado__label">{labels[r.key]}</span>
                <span className="tornado__track">
                  {seg(lo, 'lo', `${t.charts.low}: ${pct(r.low)}`)}
                  {seg(hi, 'hi', `${t.charts.high}: ${pct(r.high)}`)}
                  <span className="tornado__axis" />
                </span>
              </div>
            );
          });
        })()}
      </div>
      {excel && <p className="muted small">{t.kpi.ekReturnExcel}</p>}
    </div>
  );
}

function ChartBox({ children, height = 280 }: { children: React.ReactElement; height?: number }) {
  return (
    <div className="chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
    </div>
  );
}
