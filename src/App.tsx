import { useEffect, useMemo, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { baseKpis, blai30, type BaseKpis } from './engine';
import { I18nProvider, useI18n, type Lang } from './i18n';
import { InputPanel } from './components/Inputs';
import { ResultPanel, useComputed, type Computed } from './components/Results';
import { Segmented, Switch } from './components/ui';
import { useStore, type Calc } from './state/store';

export default function App() {
  const store = useStore();
  useEffect(() => {
    document.documentElement.lang = store.state.lang;
  }, [store.state.lang]);
  return (
    <I18nProvider lang={store.state.lang}>
      <Shell store={store} />
    </I18nProvider>
  );
}

type Store = ReturnType<typeof useStore>;

function Shell({ store }: { store: Store }) {
  const { t, eur, pct } = useI18n();
  const { state, current, setInputs } = store;
  const calc = state.calc;
  const inputs = current.inputs;
  const kpis = useMemo(() => baseKpis(inputs), [inputs]);
  const computed = useComputed(inputs, calc);
  const [tab, setTab] = useState<'inputs' | 'results'>('inputs');
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    document.title = `${current.name} · ${t.app.title}`;
  }, [current.name, t.app.title]);

  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--top-h', `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cfMonth = kpis.year1.cashflow / 12;
  const sale = computed.sales?.[1];

  return (
    <div className={`app app--tab-${tab}`}>
      <header className="top" ref={headerRef}>
        <div className="top__brand">
          <Tile />
          <span className="top__title">{t.app.title}</span>
        </div>
        <ObjectBar store={store} />
        <div className="top__tools">
          <Segmented<Lang>
            size="sm"
            label={t.app.language}
            value={state.lang}
            onChange={store.setLang}
            options={[{ value: 'de', label: 'DE' }, { value: 'es', label: 'ES' }]}
          />
          <PdfButton store={store} computed={computed} kpis={kpis} />
          <button type="button" className="icon-btn icon-btn--lg" aria-label={t.settings.title} title={t.settings.title} onClick={() => setSettingsOpen(true)}>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M3 5h9M15 5h2M3 10h3M9 10h8M3 15h9M15 15h2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              <circle cx="13.5" cy="5" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.7" />
              <circle cx="7.5" cy="10" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.7" />
              <circle cx="13.5" cy="15" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.7" />
            </svg>
          </button>
        </div>
      </header>

      <nav className="calc-switch" aria-label={t.app.title}>
        <Segmented<Calc>
          label={t.app.title}
          value={calc}
          onChange={store.setCalc}
          options={[
            { value: 'rent', label: `A · ${t.app.calcRent}` },
            { value: 'sale', label: `B · ${t.app.calcSale}` },
          ]}
        />
      </nav>

      <div className="peek" aria-live="polite">
        <span>
          {t.focus.ekShort} <b>{pct(kpis.year1.ekReturn, 1)}</b>
        </span>
        <span>
          {t.focus.gkShort} <b>{pct(kpis.year1.gkReturn, 1)}</b>
        </span>
        <span>
          {t.kpi.cashflow} <b className={cfMonth < 0 ? 'neg' : 'pos'}>{eur(cfMonth)}</b>{t.units.perMonthShort}
        </span>
        {sale && (
          <span>
            {t.kpi.profit} <b className={sale.totalProfit < 0 ? 'neg' : 'pos'}>{eur(sale.totalProfit)}</b>
          </span>
        )}
      </div>

      <main className="main">
        <div className="col col--inputs" id="panel-inputs">
          <InputPanel inputs={inputs} setInputs={setInputs} calc={calc} kpis={kpis} />
        </div>
        <div className="col col--results" id="panel-results">
          <ResultPanel inputs={inputs} calc={calc} kpis={kpis} computed={computed} />
          <footer className="foot">
            <p>{t.app.disclaimer}</p>
          </footer>
        </div>
      </main>

      <nav className="tabs" aria-label={t.app.tabInputs}>
        <button type="button" className={tab === 'inputs' ? 'is-on' : ''} aria-pressed={tab === 'inputs'} onClick={() => { setTab('inputs'); window.scrollTo({ top: 0 }); }}>
          {t.app.tabInputs}
        </button>
        <button type="button" className={tab === 'results' ? 'is-on' : ''} aria-pressed={tab === 'results'} onClick={() => { setTab('results'); window.scrollTo({ top: 0 }); }}>
          {t.app.tabResults}
        </button>
      </nav>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} store={store} />
      <PwaToast />
    </div>
  );
}

function Tile() {
  // Marke: Haus-Linie im Goldrahmen auf Navy
  return (
    <svg className="tile" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="2" fill="#002349" />
      <rect x="3.5" y="3.5" width="25" height="25" fill="none" stroke="#997d63" strokeWidth="1" />
      <path d="M9 22V14l7-5 7 5v8" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M14 22v-4h4v4" fill="none" stroke="#c2a68b" strokeWidth="1.5" />
    </svg>
  );
}

function PdfButton({ store, computed, kpis }: { store: Store; computed: Computed; kpis: BaseKpis }) {
  const i18n = useI18n();
  const { t } = i18n;
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const { exportPdf } = await import('./pdf/report');
      await exportPdf({
        i18n, name: store.current.name, calc: store.state.calc, inputs: store.current.inputs, kpis,
        rent: computed.rent, sales: computed.sales,
      });
    } catch (e) {
      console.error(e);
      window.alert(t.pdf.error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className="btn btn--pdf" onClick={run} disabled={busy} aria-label={t.pdf.buttonLabel} title={t.pdf.buttonLabel} aria-busy={busy}>
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 3v9m0 0l-3.5-3.5M10 12l3.5-3.5M4 14.5V16h12v-1.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{busy ? '…' : t.pdf.button}</span>
    </button>
  );
}

function ObjectBar({ store }: { store: Store }) {
  const { t, fill } = useI18n();
  const { state, current } = store;
  return (
    <div className="objbar">
      <label className="sr" htmlFor="obj-select">{t.objects.label}</label>
      <select id="obj-select" className="objbar__select" value={current.id} onChange={(e) => store.select(e.target.value)}>
        {state.objects.map((o) => (
          <option key={o.id} value={o.id}>{o.name || t.objects.untitled}</option>
        ))}
      </select>
      <label className="sr" htmlFor="obj-name">{t.objects.name}</label>
      <input id="obj-name" className="objbar__name" value={current.name} onChange={(e) => store.rename(e.target.value)} placeholder={t.objects.untitled} />
      <div className="objbar__actions">
        <button type="button" className="btn btn--sm" onClick={() => store.create(t.objects.untitled)}>{t.objects.newObject}</button>
        <button type="button" className="btn btn--sm" onClick={() => store.duplicate(t.objects.copySuffix)}>{t.objects.duplicate}</button>
        <button
          type="button"
          className="btn btn--sm btn--danger"
          onClick={() => {
            if (window.confirm(fill(t.objects.confirmDelete, { name: current.name }))) store.remove();
          }}
        >
          {t.objects.delete}
        </button>
      </div>
    </div>
  );
}

function SettingsDialog({ open, onClose, store }: { open: boolean; onClose: () => void; store: Store }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const inputs = store.current.inputs;
  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="dialog__body">
        <h2 className="dialog__h">{t.settings.title}</h2>
        <Switch
          checked={inputs.excelLogic}
          onChange={(v) => store.setInputs((p) => ({ ...p, excelLogic: v }))}
          label={t.settings.excelLogic}
        />
        <p className="muted small">{t.settings.excelLogicHint}</p>
        <hr className="hr" />
        <button type="button" className="btn" onClick={() => { store.create('Blai 30', blai30()); onClose(); }}>
          {t.objects.resetExample}
        </button>
        <p className="muted small">{t.objects.saved}</p>
        <div className="dialog__foot">
          <button type="button" className="btn btn--primary" onClick={onClose}>{t.settings.close}</button>
        </div>
      </div>
    </dialog>
  );
}

function PwaToast() {
  const { t } = useI18n();
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!offlineReady && !needRefresh) return null;
  return (
    <div className="toast" role="status">
      <span>{needRefresh ? t.app.updateReady : t.app.offlineReady}</span>
      {needRefresh && (
        <button type="button" className="btn btn--sm btn--primary" onClick={() => updateServiceWorker(true)}>{t.app.reload}</button>
      )}
      <button type="button" className="icon-btn" aria-label={t.settings.close} onClick={() => { setOfflineReady(false); setNeedRefresh(false); }}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
      </button>
    </div>
  );
}
