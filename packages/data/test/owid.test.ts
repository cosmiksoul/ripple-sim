import { describe, expect, it } from 'vitest';
import { parseOwidCsv, resolveOwidId } from '../pipeline/owid.js';

describe('owid', () => {
  it('reads Entity/Code/Year plus one value column, maps named locations without a code, skips regions and blanks', () => {
    const text = [
      'Entity,Code,Year,libdem',
      'France,FRA,1990,0.75',
      'France,FRA,1991,',
      'USSR,OWID_USS,1985,0.1',
      'Kosovo,OWID_KOS,2010,0.4',
      'World,OWID_WRL,1990,0.5',
      'Europe,,1990,0.6',
    ].join('\n');
    const s = parseOwidCsv(text);
    expect([...s.keys()].sort()).toEqual(['FRA', 'SUN', 'XKX']);
    expect(s.get('FRA')!.get(1990)).toBe(0.75);
    expect(s.get('FRA')!.has(1991)).toBe(false);
    expect(s.get('SUN')!.get(1985)).toBe(0.1);
  });
  it('accepts the lowercase short-name header and ignores the owid_region column', () => {
    const lower = [
      'entity,code,year,libdem_vdem__estimate_best,owid_region',
      'France,FRA,1990,0.75,Europe',
      'France,FRA,1991,,Europe',
      'USSR,OWID_USS,1985,0.1,',
      'Kosovo,OWID_KOS,2010,0.4,Europe',
      'World,OWID_WRL,1990,0.5,',
      'Europe,,1990,0.6,',
    ].join('\n');
    const upper = [
      'Entity,Code,Year,libdem',
      'France,FRA,1990,0.75',
      'France,FRA,1991,',
      'USSR,OWID_USS,1985,0.1',
      'Kosovo,OWID_KOS,2010,0.4',
      'World,OWID_WRL,1990,0.5',
      'Europe,,1990,0.6',
    ].join('\n');
    expect(parseOwidCsv(lower)).toEqual(parseOwidCsv(upper));
  });
  it('fails loudly when the column layout is unexpected', () => {
    expect(() => parseOwidCsv('Entity,Code,Year,a,b\nX,XXX,1,2,3')).toThrow(/expected one value column.*a, b/);
  });
  it('resolves ids', () => {
    expect(resolveOwidId('Yugoslavia', '')).toBe('YUG');
    expect(resolveOwidId('Germany', 'DEU')).toBe('DEU');
    expect(resolveOwidId('Africa', '')).toBeNull();
  });
});
