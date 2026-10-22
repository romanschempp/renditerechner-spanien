/** Liest „1.234,56“, „1234.56“ und „2,73“ gleichermaßen. */
export function parseNumber(raw: string): number | null {
  let s = raw.replace(/[\s €% ]/g, '').replace(/[−–]/g, '-');
  if (s === '' || s === '-') return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = lastComma > lastDot ? ',' : '.';
    s = s.split(dec === ',' ? '.' : ',').join('').replace(dec, '.');
  } else if (lastComma >= 0) {
    s = s.split(',').length > 2 ? s.split(',').join('') : s.replace(',', '.');
  } else if (lastDot >= 0) {
    const parts = s.split('.');
    // „262.900“ ist ein Tausenderpunkt, „2.73“ ein Dezimalpunkt
    if (parts.length > 2 || (parts[1].length === 3 && parts[0].replace('-', '').length >= 1 && !/^-?0$/.test(parts[0]))) {
      s = parts.join('');
    }
  }
  const n = Number(s);
  return isFinite(n) ? n : null;
}
