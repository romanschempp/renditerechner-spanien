import {
  annuityPayment, defaultHorizon, depreciation, MAX_YEARS, RATES_AS_OF, REGION_CODES, REGIONS, SAVINGS_BRACKETS, SCENARIOS, salePrice,
  type BaseKpis, type Inputs, type RegionCode,
} from '../engine';
import { useI18n } from '../i18n';
import type { Calc } from '../state/store';
import { uid } from '../state/store';
import { InfoTip, Note, NumberField, NumberInput, Section, Segmented, SelectField, Switch } from './ui';

type SetInputs = (fn: (prev: Inputs) => Inputs) => void;

function useSetters(setInputs: SetInputs) {
  return function patch<K extends keyof Inputs>(key: K, part: Partial<Inputs[K]>) {
    setInputs((prev) => ({ ...prev, [key]: { ...(prev[key] as object), ...part } }));
  };
}

export function InputPanel({ inputs, setInputs, calc, kpis }: { inputs: Inputs; setInputs: SetInputs; calc: Calc; kpis: BaseKpis }) {
  return (
    <div className="inputs">
      <PurchaseSection inputs={inputs} setInputs={setInputs} kpis={kpis} />
      <RenovationSection inputs={inputs} setInputs={setInputs} kpis={kpis} />
      <FinancingSection inputs={inputs} setInputs={setInputs} kpis={kpis} />
      <RentalSection inputs={inputs} setInputs={setInputs} kpis={kpis} />
      <TaxSection inputs={inputs} setInputs={setInputs} kpis={kpis} calc={calc} />
      {calc === 'sale' ? <SaleSection inputs={inputs} setInputs={setInputs} /> : <RentOnlySection inputs={inputs} setInputs={setInputs} kpis={kpis} />}
    </div>
  );
}

interface P {
  inputs: Inputs;
  setInputs: SetInputs;
  kpis: BaseKpis;
}

// ---------------------------------------------------------------- Kauf

function PurchaseSection({ inputs, setInputs, kpis }: P) {
  const { t, eur, fill } = useI18n();
  const patch = useSetters(setInputs);
  const p = inputs.purchase;
  const region = REGIONS[p.region];
  const set = (part: Partial<Inputs['purchase']>) => patch('purchase', part);
  const fees: { key: keyof Inputs['purchase'] & keyof typeof t.purchase; info?: string }[] = [
    { key: 'notary' }, { key: 'gestoria' }, { key: 'lawyer' }, { key: 'valuation' },
    { key: 'bankFees' }, { key: 'buyerAgent' }, { key: 'lifeInsurance' }, { key: 'other' },
  ];
  const ratesHint = fill(t.purchase.ratesHint, { date: RATES_AS_OF });

  return (
    <Section id="purchase" title={t.purchase.section} summary={eur(p.price + kpis.purchase.ancillary)}>
      <NumberField label={t.purchase.price} value={p.price} onChange={(v) => set({ price: v })} unit="€" digits={2} min={0} wide />
      <div className="row">
        <Segmented
          label={t.purchase.type}
          value={p.propertyType}
          onChange={(v) => set({ propertyType: v })}
          options={[{ value: 'used', label: t.purchase.used }, { value: 'new', label: t.purchase.new }]}
        />
      </div>
      <SelectField<RegionCode>
        label={t.purchase.region}
        value={p.region}
        onChange={(code) => set({ region: code, itpPct: REGIONS[code].itp, ajdPct: REGIONS[code].ajd })}
        options={REGION_CODES.map((c) => ({ value: c, label: `${REGIONS[c].name} · ITP ${REGIONS[c].itp} %` }))}
      />

      <div className="subhead">
        <span>{t.purchase.costs}</span>
        <Segmented
          size="sm"
          label={t.purchase.costs}
          value={p.costMode}
          onChange={(v) => set({ costMode: v })}
          options={[{ value: 'quick', label: t.common.quick }, { value: 'detail', label: t.common.detail }]}
        />
      </div>

      {p.costMode === 'quick' ? (
        <NumberField
          label={t.purchase.quickCosts}
          value={p.quickCostsPct}
          onChange={(v) => set({ quickCostsPct: v })}
          unit="%"
          min={0}
          hint={`${t.purchase.quickHint} = ${eur(kpis.purchase.ancillary)}`}
          wide
        />
      ) : (
        <>
          <div className="grid2">
            {p.propertyType === 'used' ? (
              <NumberField label={t.purchase.itp} value={p.itpPct} onChange={(v) => set({ itpPct: v })} unit="%" min={0} info={ratesHint} hint={eur(kpis.purchase.itp)} />
            ) : (
              <>
                <NumberField label={t.purchase.iva} value={p.ivaPct} onChange={(v) => set({ ivaPct: v })} unit="%" min={0} hint={eur(kpis.purchase.iva)} />
                <NumberField label={t.purchase.ajd} value={p.ajdPct} onChange={(v) => set({ ajdPct: v })} unit="%" min={0} info={ratesHint} hint={eur(kpis.purchase.ajd)} />
              </>
            )}
          </div>
          {(p.propertyType === 'used' ? p.itpPct !== region.itp : p.ajdPct !== region.ajd) ? (
            <button type="button" className="link" onClick={() => set({ itpPct: region.itp, ajdPct: region.ajd })}>
              {t.purchase.applyRegion} ({region.name}: {p.propertyType === 'used' ? `ITP ${region.itp} %` : `AJD ${region.ajd} %`})
            </button>
          ) : (
            <Note>
              {region.name}, {t.common.pleaseCheck} · {RATES_AS_OF}
              {region.tiered ? ` · ${t.purchase.tieredHint}` : ''}
            </Note>
          )}
          <div className="grid2">
            {fees.map((f) => (
              <NumberField
                key={f.key}
                label={t.purchase[f.key] as string}
                value={p[f.key] as number}
                onChange={(v) => set({ [f.key]: v } as Partial<Inputs['purchase']>)}
                unit="€"
                min={0}
              />
            ))}
          </div>
        </>
      )}
      <Total label={t.purchase.totalAncillary} value={eur(kpis.purchase.ancillary)} />
    </Section>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="total">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

// ---------------------------------------------------------------- Renovierung

function RenovationSection({ inputs, setInputs, kpis }: P) {
  const { t, eur } = useI18n();
  const r = inputs.renovation;
  const setR = (next: Partial<Inputs['renovation']>) => setInputs((prev) => ({ ...prev, renovation: { ...prev.renovation, ...next } }));
  const laterSum = r.later.reduce((s, l) => s + l.amount, 0);

  return (
    <Section id="renovation" title={t.renovation.section} summary={eur(kpis.purchase.renovation + laterSum)}>
      <h3 className="h3">{t.renovation.items}</h3>
      {r.items.length === 0 && <p className="muted">{t.renovation.empty}</p>}
      <ul className="items">
        {r.items.map((it, idx) => (
          <li key={it.id} className="item">
            <input
              className="txt"
              value={it.label}
              placeholder={t.renovation.itemPlaceholder}
              aria-label={t.renovation.itemPlaceholder}
              onChange={(e) => setR({ items: r.items.map((x, j) => (j === idx ? { ...x, label: e.target.value } : x)) })}
            />
            <div className="field__ctl">
              <NumberInput value={it.amount} onChange={(v) => setR({ items: r.items.map((x, j) => (j === idx ? { ...x, amount: v ?? 0 } : x)) })} ariaLabel={it.label || t.renovation.items} />
              <span className="field__unit">€</span>
            </div>
            <RemoveBtn label={t.common.remove} onClick={() => setR({ items: r.items.filter((_, j) => j !== idx) })} />
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn--ghost" onClick={() => setR({ items: [...r.items, { id: uid(), label: '', amount: 0 }] })}>
        + {t.common.add}
      </button>
      <Total label={t.renovation.total} value={eur(kpis.purchase.renovation)} />

      <h3 className="h3">
        {t.renovation.later} <InfoTip text={t.renovation.laterHint} />
      </h3>
      <ul className="items">
        {r.later.map((it, idx) => (
          <li key={it.id} className="item item--later">
            <input
              className="txt"
              value={it.label}
              placeholder={t.renovation.itemPlaceholder}
              aria-label={t.renovation.later}
              onChange={(e) => setR({ later: r.later.map((x, j) => (j === idx ? { ...x, label: e.target.value } : x)) })}
            />
            <div className="field__ctl field__ctl--year">
              <span className="field__pre">{t.common.year}</span>
              <NumberInput value={it.year} digits={0} min={1} max={MAX_YEARS} onChange={(v) => setR({ later: r.later.map((x, j) => (j === idx ? { ...x, year: Math.round(v ?? 1) } : x)) })} ariaLabel={t.renovation.inYear} />
            </div>
            <div className="field__ctl">
              <NumberInput value={it.amount} onChange={(v) => setR({ later: r.later.map((x, j) => (j === idx ? { ...x, amount: v ?? 0 } : x)) })} ariaLabel={t.common.total} />
              <span className="field__unit">€</span>
            </div>
            <RemoveBtn label={t.common.remove} onClick={() => setR({ later: r.later.filter((_, j) => j !== idx) })} />
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn--ghost" onClick={() => setR({ later: [...r.later, { id: uid(), label: '', amount: 0, year: 5 }] })}>
        + {t.common.add}
      </button>
    </Section>
  );
}

function RemoveBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="icon-btn" aria-label={label} title={label} onClick={onClick}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
    </button>
  );
}

// ---------------------------------------------------------------- Finanzierung

function FinancingSection({ inputs, setInputs, kpis }: P) {
  const { t, eur, pct, fill, num } = useI18n();
  const patch = useSetters(setInputs);
  const f = inputs.financing;
  const set = (part: Partial<Inputs['financing']>) => patch('financing', part);
  const cap = kpis.capital;
  const sched = kpis.schedule;
  const variablePart = f.rateType !== 'fixed';

  let targetText = '';
  if (f.enabled && f.termMode === 'target' && f.repayment !== 'bullet' && sched.months.length) {
    const years = num(sched.termMonths / 12, 1);
    if (f.repayment === 'annuity') {
      const r = sched.months[0].ratePct / 1200;
      targetText = fill(t.financing.targetResult, { rate: eur(annuityPayment(cap.loan, r, sched.termMonths), 2), years });
    } else {
      targetText = fill(t.financing.targetResultLinear, { rate: eur(sched.months[0].principal, 2), years });
    }
  }

  return (
    <Section id="financing" title={t.financing.section} summary={f.enabled ? `${eur(cap.loan)} · ${eur(kpis.monthlyPayment)}${t.units.perMonthShort}` : t.common.off}>
      <Switch checked={f.enabled} onChange={(v) => set({ enabled: v })} label={t.financing.enabled} />
      {!f.enabled ? (
        <Note>{t.financing.noLoan}</Note>
      ) : (
        <>
          <div className="subhead">
            <span>{t.financing.amount}</span>
            <Segmented size="sm" label={t.financing.amount} value={f.amountMode} onChange={(v) => set({ amountMode: v })}
              options={[{ value: 'eur', label: '€' }, { value: 'pct', label: t.financing.amountPctShort }]} />
          </div>
          {f.amountMode === 'eur' ? (
            <NumberField label={t.financing.amount} value={f.amount} onChange={(v) => set({ amount: v })} unit="€" min={0} wide
              hint={`${pct(cap.loan / Math.max(1, inputs.purchase.price), 1)} ${t.purchase.price}`} />
          ) : (
            <NumberField label={t.financing.amountPct} value={f.amountPct} onChange={(v) => set({ amountPct: v })} unit="%" min={0} wide hint={eur(cap.loan)} />
          )}
          <div className="equity-bar" aria-label={t.financing.ratio}>
            <div className="equity-bar__track">
              <span className="equity-bar__eq" style={{ width: `${Math.max(0, Math.min(1, cap.equityRatio)) * 100}%` }} />
            </div>
            <div className="equity-bar__legend">
              <span><i className="dot dot--eq" />{t.financing.equity} {eur(cap.equity)} · {pct(cap.equityRatio, 1)}</span>
              <span><i className="dot dot--debt" />{t.charts.debt} {pct(cap.debtRatio, 1)}</span>
            </div>
          </div>

          <h3 className="h3">{t.financing.repayment}</h3>
          <Segmented label={t.financing.repayment} value={f.repayment} onChange={(v) => set({ repayment: v })}
            options={[
              { value: 'annuity', label: t.financing.annuity },
              { value: 'linear', label: t.financing.linear },
              { value: 'bullet', label: t.financing.bullet },
            ]} />
          <p className="muted small">{t.financing[`${f.repayment}Hint`]}</p>

          <h3 className="h3">{t.financing.term}</h3>
          {f.repayment !== 'bullet' && (
            <Segmented size="sm" label={t.financing.term} value={f.termMode} onChange={(v) => set({ termMode: v })}
              options={[{ value: 'years', label: t.financing.termYears }, { value: 'target', label: t.financing.termTarget }]} />
          )}
          {f.termMode === 'years' || f.repayment === 'bullet' ? (
            <NumberField label={t.financing.term} value={f.termYears} onChange={(v) => set({ termYears: v })} unit={t.units.years} min={1} max={MAX_YEARS} digits={1} />
          ) : (
            <>
              <div className="grid2">
                <NumberField label={t.financing.targetPct} value={f.targetPct} onChange={(v) => set({ targetPct: v })} unit="%" min={1} max={100} />
                <NumberField label={t.financing.targetYears} value={f.targetYears} onChange={(v) => set({ targetYears: v })} unit={t.units.years} min={1} max={MAX_YEARS} digits={1} />
              </div>
              {targetText && <p className="result-line">{targetText}</p>}
            </>
          )}

          <h3 className="h3">
            {t.financing.rateType} <InfoTip text={t.financing.rateRiskHint} />
          </h3>
          <Segmented label={t.financing.rateType} value={f.rateType} onChange={(v) => set({ rateType: v })}
            options={[
              { value: 'fixed', label: t.financing.fixed },
              { value: 'variable', label: t.financing.variable },
              { value: 'mixed', label: t.financing.mixed },
            ]} />
          <div className="grid2">
            {f.rateType !== 'variable' && (
              <NumberField label={t.financing.fixedRate} value={f.fixedRatePct} onChange={(v) => set({ fixedRatePct: v })} unit="%" digits={3} />
            )}
            {f.rateType === 'mixed' && (
              <NumberField label={t.financing.fixedYears} value={f.fixedYears} onChange={(v) => set({ fixedYears: Math.round(v) })} unit={t.units.years} min={0} max={MAX_YEARS} digits={0} />
            )}
            {variablePart && (
              <>
                <NumberField label={t.financing.margin} value={f.marginPct} onChange={(v) => set({ marginPct: v })} unit="%" digits={3} />
                {f.euriborMode === 'constant' && (
                  <NumberField label={t.financing.euribor} value={f.euriborPct} onChange={(v) => set({ euriborPct: v })} unit="%" digits={3} />
                )}
              </>
            )}
          </div>
          {variablePart && (
            <>
              <div className="subhead">
                <span>{t.financing.euriborMode}</span>
                <Segmented size="sm" label={t.financing.euriborMode} value={f.euriborMode}
                  onChange={(v) => set({ euriborMode: v, euriborPath: v === 'path' && f.euriborPath.length === 0 ? [f.euriborPct, f.euriborPct, f.euriborPct] : f.euriborPath })}
                  options={[{ value: 'constant', label: t.financing.constant }, { value: 'path', label: t.financing.path }]} />
              </div>
              {f.euriborMode === 'path' && (
                <>
                  <p className="muted small">{t.financing.pathHint}</p>
                  <div className="path">
                    {f.euriborPath.map((v, idx) => (
                      <div key={idx} className="path__cell">
                        <span className="path__y">{t.common.year} {idx + 1}</span>
                        <div className="field__ctl">
                          <NumberInput value={v} digits={3} ariaLabel={`${t.financing.euribor} ${t.common.year} ${idx + 1}`}
                            onChange={(n) => set({ euriborPath: f.euriborPath.map((x, j) => (j === idx ? n ?? 0 : x)) })} />
                          <span className="field__unit">%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="row">
                    <button type="button" className="btn btn--ghost" disabled={f.euriborPath.length >= MAX_YEARS}
                      onClick={() => set({ euriborPath: [...f.euriborPath, f.euriborPath[f.euriborPath.length - 1] ?? f.euriborPct] })}>
                      + {t.financing.addYear}
                    </button>
                    {f.euriborPath.length > 1 && (
                      <button type="button" className="btn btn--ghost" onClick={() => set({ euriborPath: f.euriborPath.slice(0, -1) })}>
                        − {t.common.remove}
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          )}
          <p className="result-line">
            {t.financing.effectiveRate}: <strong>{pct((sched.years[0]?.ratePct ?? 0) / 100, 2)}</strong> · {t.kpi.loanPayment}: <strong>{eur(kpis.monthlyPayment, 2)}</strong>
          </p>
          <NumberField label={t.financing.prepayment} value={f.prepaymentPenaltyPct} onChange={(v) => set({ prepaymentPenaltyPct: v })} unit="%" min={0} info={t.financing.prepaymentHint} />
        </>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- Vermietung

function RentalSection({ inputs, setInputs, kpis }: P) {
  const { t, eur, pct, num } = useI18n();
  const patch = useSetters(setInputs);
  const r = inputs.rental;
  const set = (part: Partial<Inputs['rental']>) => patch('rental', part);
  const fixed: { key: 'ibi' | 'waste' | 'insurance' | 'reserve' | 'nonRecoverable' | 'taxAdvice' | 'other'; info?: string }[] = [
    { key: 'ibi' }, { key: 'waste' }, { key: 'insurance', info: t.rental.insuranceHint }, { key: 'reserve' },
    { key: 'nonRecoverable' }, { key: 'taxAdvice' }, { key: 'other' },
  ];
  const showManual = r.manualRent.length > 0;
  const years = 10;

  return (
    <Section id="rental" title={t.rental.section} summary={r.enabled ? `${eur(r.monthlyRent)}${t.units.perMonthShort}` : t.rental.notRented}>
      <Switch checked={r.enabled} onChange={(v) => set({ enabled: v })} label={t.rental.enabled} />
      {!r.enabled && <Note>{t.rental.disabledNote}</Note>}
      {r.enabled && (
      <>
      <NumberField label={t.rental.rent} value={r.monthlyRent} onChange={(v) => set({ monthlyRent: v })} unit={t.units.perMonth} min={0} wide info={t.rental.rentLawHint} />
      <NumberField label={t.rental.startDelay} value={r.startDelayMonths} onChange={(v) => set({ startDelayMonths: Math.round(v) })} unit={t.units.months} min={0} max={MAX_YEARS * 12} digits={0} info={t.rental.startDelayHint} />
      <Switch
        checked={showManual}
        onChange={(v) => set({ manualRent: v ? Array.from({ length: years }, () => null) : [] })}
        label={t.rental.manualRent}
        info={t.rental.manualHint}
      />
      {showManual && (
        <div className="path">
          {r.manualRent.map((v, idx) => (
            <div key={idx} className="path__cell">
              <span className="path__y">{t.common.year} {idx + 1}</span>
              <div className="field__ctl">
                <NumberInput value={v} allowEmpty placeholder={t.common.auto} ariaLabel={`${t.rental.rent} ${t.common.year} ${idx + 1}`}
                  onChange={(n) => set({ manualRent: r.manualRent.map((x, j) => (j === idx ? n : x)) })} />
                <span className="field__unit">€</span>
              </div>
            </div>
          ))}
          {r.manualRent.length < MAX_YEARS && (
            <button type="button" className="btn btn--ghost" onClick={() => set({ manualRent: [...r.manualRent, null] })}>+ {t.common.year}</button>
          )}
        </div>
      )}

      <div className="subhead">
        <span>{t.rental.vacancy}</span>
        <Segmented size="sm" label={t.rental.vacancy} value={r.vacancyMode} onChange={(v) => set({ vacancyMode: v })}
          options={[{ value: 'pct', label: '%' }, { value: 'months', label: t.units.months }]} />
      </div>
      {r.vacancyMode === 'pct' ? (
        <NumberField label={t.rental.vacancy} value={r.vacancyPct} onChange={(v) => set({ vacancyPct: v })} unit="%" min={0} max={100} hint={`= ${num(r.vacancyPct * 0.12, 2)} ${t.units.months}`} />
      ) : (
        <NumberField label={t.rental.vacancyMonths} value={r.vacancyMonths} onChange={(v) => set({ vacancyMonths: v })} unit={t.units.months} min={0} max={12} hint={`= ${pct(kpis.vacancyRate, 1)}`} />
      )}

      <div className="grid2">
        <NumberField label={t.rental.management} value={r.managementPct} onChange={(v) => set({ managementPct: v })} unit="%" min={0} info={t.rental.pctOfRentHint} hint={eur(kpis.year1.costs.management)} />
        <NumberField label={t.rental.maintenance} value={r.maintenancePct} onChange={(v) => set({ maintenancePct: v })} unit="%" min={0} info={t.rental.pctOfRentHint} hint={eur(kpis.year1.costs.maintenance)} />
      </div>
      </>
      )}

      <h3 className="h3">{t.rental.fixedCosts}</h3>
      <div className="grid2">
        <NumberField label={t.rental.community} value={r.communityMonthly} onChange={(v) => set({ communityMonthly: v })} unit={t.units.perMonth} min={0} hint={eur(r.communityMonthly * 12) + '/' + t.common.year.toLowerCase()} />
        {fixed.map((f) => (
          <NumberField key={f.key} label={t.rental[f.key]} value={r[f.key]} onChange={(v) => set({ [f.key]: v })} unit={t.units.perYear} min={0} info={f.info} />
        ))}
      </div>

      <div className="subhead">
        <span>{t.rental.growth}</span>
        <Segmented size="sm" label={t.rental.growth} value={r.growthMode} onChange={(v) => set({ growthMode: v })}
          options={[{ value: 'single', label: t.rental.growthSingle }, { value: 'separate', label: t.rental.growthSeparate }]} />
      </div>
      {r.growthMode === 'single' ? (
        <NumberField label={t.rental.growthAll} value={r.growthPct} onChange={(v) => set({ growthPct: v })} unit={t.units.pctPa} />
      ) : (
        <div className="grid2">
          <NumberField label={t.rental.rentGrowth} value={r.rentGrowthPct} onChange={(v) => set({ rentGrowthPct: v })} unit={t.units.pctPa} />
          <NumberField label={t.rental.costGrowth} value={r.costGrowthPct} onChange={(v) => set({ costGrowthPct: v })} unit={t.units.pctPa} />
        </div>
      )}
      <Total label={t.kpi.costs + ' · ' + t.kpi.costsSub} value={eur(kpis.year1.opCosts)} />
    </Section>
  );
}

// ---------------------------------------------------------------- Steuern

function TaxSection({ inputs, setInputs, kpis, calc }: P & { calc: Calc }) {
  const { t, eur, pct, fill } = useI18n();
  const patch = useSetters(setInputs);
  const x = inputs.tax;
  const set = (part: Partial<Inputs['tax']>) => patch('tax', part);
  const dep = depreciation(inputs, kpis.purchase);
  const fromCadastral = x.cadastralLand + x.cadastralBuilding > 0;
  const rate = (v: number) => pct(v, 0);
  return (
    <Section id="tax" title={t.tax.section} summary={`${x.rentalTaxEnabled ? `${x.rentalTaxPct} %` : '—'} · ${t.tax.depreciation.split(' (')[0]} ${eur(dep.annual)}`}>
      <Note>{t.tax.info}</Note>
      {inputs.excelLogic && <Note tone="warn">{t.settings.excelActive}</Note>}

      <h3 className="h3">{t.tax.rentalHead}</h3>
      <Switch checked={x.rentalTaxEnabled} onChange={(v) => set({ rentalTaxEnabled: v })} label={t.tax.rentalTax} info={t.tax.rentalTaxHint} />
      {x.rentalTaxEnabled && (
        <div className="grid2">
          <NumberField label={t.tax.irpfRate} value={x.rentalTaxPct} onChange={(v) => set({ rentalTaxPct: v })} unit="%" min={0} max={100} info={t.tax.irpfRateHint} />
          <NumberField label={t.tax.reduction} value={x.rentalReductionPct} onChange={(v) => set({ rentalReductionPct: v })} unit="%" min={0} max={100} info={t.tax.reductionHint} />
        </div>
      )}

      <h3 className="h3">
        {t.tax.depreciation} <InfoTip text={t.tax.depreciationHint} />
      </h3>
      <div className="grid2">
        <NumberField label={t.tax.cadastralBuilding} value={x.cadastralBuilding} onChange={(v) => set({ cadastralBuilding: v })} unit="€" min={0} info={t.tax.cadastralHint} />
        <NumberField label={t.tax.cadastralLand} value={x.cadastralLand} onChange={(v) => set({ cadastralLand: v })} unit="€" min={0} info={t.tax.cadastralHint} />
      </div>
      {fromCadastral ? (
        <p className="muted small">{fill(t.tax.landFromCadastral, { pct: pct(dep.landShare, 1) })}</p>
      ) : (
        <NumberField label={t.tax.landPct} value={x.landPct} onChange={(v) => set({ landPct: v })} unit="%" min={0} max={100} info={t.tax.landPctHint} />
      )}
      <dl className="calc-lines">
        <div><dt>{t.tax.depAcquisition}</dt><dd>{eur(dep.acquisitionCost)}</dd></div>
        <div><dt>− {t.tax.depLand} ({pct(dep.landShare, 1)})</dt><dd>{eur(-(dep.acquisitionCost - dep.buildingFromCost))}</dd></div>
        <div><dt>{t.tax.depBuilding}</dt><dd>{eur(dep.building)}</dd></div>
        {dep.renovation > 0 && <div><dt>+ {t.tax.depRenovation}</dt><dd>{eur(dep.renovation)}</dd></div>}
        <div><dt>{t.tax.depBase}</dt><dd>{eur(dep.base)}</dd></div>
      </dl>
      <Total label={t.tax.depAnnual} value={eur(dep.annual)} />

      {calc === 'sale' && (
        <>
          <h3 className="h3">{t.tax.gainsHead}</h3>
          {x.nonResident ? (
            <p className="muted small">{t.tax.gainsNonResident}</p>
          ) : (
            <>
              <p className="muted small">{t.tax.gainsInfo}</p>
              <dl className="calc-lines">
                {SAVINGS_BRACKETS.map((b, idx) => {
                  const lower = idx === 0 ? 0 : SAVINGS_BRACKETS[idx - 1].upTo;
                  const label = isFinite(b.upTo) ? fill(t.tax.bracketUpTo, { v: eur(b.upTo) }) : fill(t.tax.bracketAbove, { v: eur(lower) });
                  return <div key={b.upTo}><dt>{label}</dt><dd>{rate(b.rate)}</dd></div>;
                })}
              </dl>
            </>
          )}
          <p className="muted small">{t.tax.gainsNote}</p>
        </>
      )}
      <Switch checked={x.nonResident} onChange={(v) => set({ nonResident: v })} label={t.tax.nonResident} info={t.tax.nonResidentHint} />
      <ul className="checks">
        <li>{t.tax.residenceHint}</li>
        <li>{t.tax.ownUseHint}</li>
      </ul>
    </Section>
  );
}

// ---------------------------------------------------------------- Verkauf (Rechner B)

function SaleSection({ inputs, setInputs }: { inputs: Inputs; setInputs: SetInputs }) {
  const { t, eur, num, fill } = useI18n();
  const patch = useSetters(setInputs);
  const s = inputs.sale;
  const set = (part: Partial<Inputs['sale']>) => patch('sale', part);
  const setScenario = (key: (typeof SCENARIOS)[number], part: Partial<Inputs['sale']['scenarios']['realistic']>) =>
    set({ scenarios: { ...s.scenarios, [key]: { ...s.scenarios[key], ...part } } });

  return (
    <Section id="sale" title={t.sale.section} summary={`${num(s.holdYears * 12, 0)} ${t.units.months} · ${eur(salePrice(inputs, 'realistic'))}`}>
      <NumberField label={t.sale.hold} value={Math.round(s.holdYears * 12)} onChange={(v) => set({ holdYears: Math.max(1, Math.round(v)) / 12 })} unit={t.units.months} min={1} max={MAX_YEARS * 12} digits={0} wide
        hint={fill(t.sale.holdHint, { years: num(s.holdYears, s.holdYears % 1 ? 2 : 0) })} />
      <div className="subhead">
        <span>{t.sale.priceMode} <InfoTip text={t.sale.scenarioHint} /></span>
        <Segmented size="sm" label={t.sale.priceMode} value={s.priceMode} onChange={(v) => set({ priceMode: v })}
          options={[{ value: 'direct', label: t.sale.direct }, { value: 'growth', label: t.sale.growth }]} />
      </div>
      <div className="scen">
        {SCENARIOS.map((k) => (
          <div key={k} className={`scen__col scen__col--${k}`}>
            <span className="scen__name">{t.sale[k]}</span>
            {s.priceMode === 'direct' ? (
              <div className="field__ctl">
                <NumberInput value={s.scenarios[k].price} min={0} onChange={(v) => setScenario(k, { price: v ?? 0 })} ariaLabel={`${t.sale.salePrice} ${t.sale[k]}`} />
                <span className="field__unit">€</span>
              </div>
            ) : (
              <>
                <div className="field__ctl">
                  <NumberInput value={s.scenarios[k].growthPct} onChange={(v) => setScenario(k, { growthPct: v ?? 0 })} ariaLabel={`${t.sale.growthPa} ${t.sale[k]}`} />
                  <span className="field__unit">{t.units.pctPa}</span>
                </div>
                <span className="scen__out">{eur(salePrice(inputs, k))}</span>
              </>
            )}
          </div>
        ))}
      </div>
      <p className="muted small">{t.sale.scenarioHint}</p>

      <h3 className="h3">{t.sale.costs}</h3>
      <div className="grid2">
        <NumberField label={t.sale.agent} value={s.agentPct} onChange={(v) => set({ agentPct: v })} unit="%" min={0} />
        <NumberField label={t.sale.lawyer} value={s.lawyer} onChange={(v) => set({ lawyer: v })} unit="€" min={0} />
        <NumberField label={t.sale.plusvalia} value={s.plusvalia} onChange={(v) => set({ plusvalia: v })} unit="€" min={0} info={t.sale.plusvaliaHint} />
        <NumberField label={t.sale.preparation} value={s.preparation} onChange={(v) => set({ preparation: v })} unit="€" min={0} />
        <NumberField label={t.sale.openCommunity} value={s.openCommunity} onChange={(v) => set({ openCommunity: v })} unit="€" min={0} />
        <NumberField label={t.sale.other} value={s.other} onChange={(v) => set({ other: v })} unit="€" min={0} />
      </div>
      {inputs.financing.enabled && <p className="muted small">{t.sale.prepaymentNote} ({inputs.financing.prepaymentPenaltyPct} %)</p>}
    </Section>
  );
}

// ---------------------------------------------------------------- Rechner A

function RentOnlySection({ inputs, setInputs, kpis }: { inputs: Inputs; setInputs: SetInputs; kpis: BaseKpis }) {
  const { t } = useI18n();
  const patch = useSetters(setInputs);
  const ro = inputs.rentOnly;
  const auto = ro.horizonYears == null;
  const horizon = defaultHorizon(inputs, kpis.schedule);
  return (
    <Section id="rentOnly" title={t.rentOnly.section} summary={`${horizon} ${t.units.years}`}>
      <Segmented size="sm" label={t.rentOnly.horizon} value={auto ? 'auto' : 'custom'}
        onChange={(v) => patch('rentOnly', { horizonYears: v === 'auto' ? null : horizon })}
        options={[{ value: 'auto', label: t.rentOnly.horizonAuto }, { value: 'custom', label: t.rentOnly.horizonCustom }]} />
      <NumberField label={t.rentOnly.horizon} value={horizon} onChange={(v) => patch('rentOnly', { horizonYears: Math.round(v) })} unit={t.units.years} min={1} max={MAX_YEARS} digits={0} />
      <NumberField label={t.rentOnly.valueGrowth} value={ro.valueGrowthPct} onChange={(v) => patch('rentOnly', { valueGrowthPct: v })} unit={t.units.pctPa} info={`${t.rentOnly.valueGrowthHint} ${t.results.inflationHint}`} />
    </Section>
  );
}

