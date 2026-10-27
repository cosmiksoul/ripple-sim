export type Yearly = Map<number, number>;
export type Series = Map<string, Yearly>;

export function setPoint(series: Series, id: string, year: number, value: number): void {
  let y = series.get(id);
  if (!y) {
    y = new Map();
    series.set(id, y);
  }
  y.set(year, value);
}
