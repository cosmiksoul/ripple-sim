import type { Country, Edge, IndicatorsMeta } from '@ripple/schema';

export interface Dataset {
  countries: Country[];
  meta: IndicatorsMeta;
  values: Float32Array; // [indicator][country][month], month = abs - meta.firstAbs
  graph: Edge[];
}
