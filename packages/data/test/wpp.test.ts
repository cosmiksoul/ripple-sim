import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { gunzipText, parseWppCsv } from '../pipeline/wpp.js';

describe('wpp', () => {
  const header = 'SortOrder,LocID,Notes,ISO3_code,ISO2_code,SDMX_code,LocTypeID,LocTypeName,ParentID,Location,VarID,Variant,Time,PopMale,PopFemale,PopTotal,PopDensity';
  const row = (iso: string, variant: string, year: number, pop: number) => `1,1,,${iso},,,4,Country/Area,1,${iso},2,${variant},${year},1,1,${pop},1`;
  it('keeps Estimates and Medium, prefers Estimates, converts thousands to people, skips regions', () => {
    const text = [header, row('FRA', 'Estimates', 1990, 56000.5), row('FRA', 'Medium', 1990, 1), row('FRA', 'Medium', 2050, 60000), row('FRA', 'High', 2050, 70000), row('', 'Estimates', 1990, 5000000)].join('\n');
    const s = parseWppCsv(text);
    expect([...s.keys()]).toEqual(['FRA']);
    expect(s.get('FRA')!.get(1990)).toBe(56000500);
    expect(s.get('FRA')!.get(2050)).toBe(60000000);
  });
  it('gunzips and complains about missing columns', () => {
    expect(gunzipText(gzipSync(Buffer.from('a,b\n1,2')))).toBe('a,b\n1,2');
    expect(() => parseWppCsv('a,b\n1,2')).toThrow(/missing column ISO3_code/);
  });
});
