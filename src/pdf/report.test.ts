/// <reference types="node" />
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { baseKpis, blai30, rentCalculator, saleCalculator, SCENARIOS } from '../engine';
import { makeI18n, type Lang } from '../i18n';
import type { Calc } from '../state/store';
import { buildPdf } from './report';

const fonts = async () =>
  ['SourceSerif4-Regular.ttf', 'SourceSerif4-SemiBold.ttf', 'PublicSans-Regular.ttf', 'PublicSans-SemiBold.ttf'].map(
    (f) => [f, readFileSync(`public/fonts/${f}`).toString('base64')] as [string, string],
  );

function data(lang: Lang, calc: Calc, tweak?: (i: ReturnType<typeof blai30>) => void) {
  const inputs = blai30();
  tweak?.(inputs);
  return {
    i18n: makeI18n(lang), name: 'Blai 30', calc, inputs, kpis: baseKpis(inputs),
    rent: calc === 'rent' ? rentCalculator(inputs) : null,
    sales: calc === 'sale' ? SCENARIOS.map((k) => saleCalculator(inputs, k)) : null,
  };
}

describe('PDF-Übersicht', () => {
  for (const lang of ['de', 'es'] as Lang[]) {
    for (const calc of ['rent', 'sale'] as Calc[]) {
      it(`${lang} / ${calc}: erzeugt ein PDF mit Übersicht und Jahresseite`, async () => {
        const doc = await buildPdf(data(lang, calc), fonts);
        expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
        const out = doc.output('arraybuffer');
        expect(out.byteLength).toBeGreaterThan(20_000);
        if (process.env.PDF_OUT) writeFileSync(`${process.env.PDF_OUT}/${lang}-${calc}.pdf`, Buffer.from(out));
      });
    }
  }

  it('ohne Kredit', async () => {
    const doc = await buildPdf(
      data('de', 'rent', (i) => {
        i.financing.enabled = false;
        i.rental.monthlyRent = 300;
      }),
      fonts,
    );
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    if (process.env.PDF_OUT) writeFileSync(`${process.env.PDF_OUT}/de-noloan.pdf`, Buffer.from(doc.output('arraybuffer')));
  });

  it('mit Kredit und negativem Cashflow', async () => {
    const doc = await buildPdf(data('es', 'rent', (i) => { i.rental.monthlyRent = 900; }), fonts);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    if (process.env.PDF_OUT) writeFileSync(`${process.env.PDF_OUT}/es-neg.pdf`, Buffer.from(doc.output('arraybuffer')));
  });
});
