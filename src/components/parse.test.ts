import { describe, expect, it } from 'vitest';
import { parseNumber } from './parse';

describe('Zahleneingabe', () => {
  it.each([
    ['262.900', 262900],
    ['262900', 262900],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['2,73', 2.73],
    ['2.73', 2.73],
    ['0.125', 0.125],
    ['-2', -2],
    ['−1,5', -1.5],
    ['1.000.000', 1000000],
    ['332,75 €', 332.75],
    ['', null],
    ['abc', null],
  ])('%s → %s', (raw, expected) => {
    expect(parseNumber(raw)).toBe(expected);
  });
});
