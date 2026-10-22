export interface Flow {
  /** Zeitpunkt in Jahren ab Kauf */
  t: number;
  amount: number;
}

export function npv(rate: number, flows: Flow[]): number {
  return flows.reduce((s, f) => s + f.amount / Math.pow(1 + rate, f.t), 0);
}

/**
 * Interner Zinsfuß (jährlich) für Zahlungen zu beliebigen Zeitpunkten.
 * Gibt null zurück, wenn es keinen Vorzeichenwechsel gibt (IRR nicht definiert).
 */
export function irr(flows: Flow[]): number | null {
  const hasNeg = flows.some((f) => f.amount < 0);
  const hasPos = flows.some((f) => f.amount > 0);
  if (!hasNeg || !hasPos) return null;

  let lo = -0.9999;
  let hi = 1;
  let fLo = npv(lo, flows);
  let fHi = npv(hi, flows);
  while (fLo * fHi > 0 && hi < 1e6) {
    hi *= 2;
    fHi = npv(hi, flows);
  }
  if (fLo * fHi > 0) return null;

  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid, flows);
    if (Math.abs(fMid) < 1e-9 || hi - lo < 1e-12) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}
