import { describe, expect, it } from 'vitest';
import { absMonth, decadeOf, decadeStartAbs, fromAbs, isJanuary } from '@ripple/schema';

describe('time', () => {
  it('round-trips year/month', () => {
    expect(fromAbs(absMonth(1991, 12))).toEqual({ year: 1991, month: 12 });
    expect(absMonth(1980, 1) + 11).toBe(absMonth(1980, 12));
  });
  it('computes decades', () => {
    expect(decadeOf(absMonth(1986, 4))).toBe(1980);
    expect(decadeStartAbs(1990)).toBe(absMonth(1990, 1));
    expect(isJanuary(absMonth(2001, 1))).toBe(true);
    expect(isJanuary(absMonth(2001, 2))).toBe(false);
  });
  it('rejects bad months', () => {
    expect(() => absMonth(2000, 13)).toThrow();
  });
});
