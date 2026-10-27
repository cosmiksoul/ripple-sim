export const MONTHS_PER_DECADE = 120;

export function absMonth(year: number, month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new RangeError(`bad month ${month}`);
  return year * 12 + (month - 1);
}
export function fromAbs(abs: number): { year: number; month: number } {
  return { year: Math.floor(abs / 12), month: (((abs % 12) + 12) % 12) + 1 };
}
export function decadeOf(abs: number): number {
  return Math.floor(abs / MONTHS_PER_DECADE) * 10;
}
export function decadeStartAbs(decade: number): number {
  return decade * 12;
}
export function isJanuary(abs: number): boolean {
  return ((abs % 12) + 12) % 12 === 0;
}
