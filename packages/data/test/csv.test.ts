import { describe, expect, it } from 'vitest';
import { csvObjects, parseCsv } from '../pipeline/csv.js';

describe('csv', () => {
  it('parses quoted fields, escaped quotes, CRLF and embedded newlines', () => {
    const text = 'a,b,c\r\n1,"x, y","say ""hi"""\r\n2,"multi\nline",\n';
    expect(parseCsv(text)).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x, y', 'say "hi"'],
      ['2', 'multi\nline', ''],
    ]);
  });
  it('keeps a trailing empty field and a last line without newline', () => {
    expect(parseCsv('a,b,\n1,2,3')).toEqual([['a', 'b', ''], ['1', '2', '3']]);
  });
  it('maps rows to objects by header and strips a BOM', () => {
    expect(csvObjects('\uFEFFEntity,Code,Year,v\nFrance,FRA,1990,0.5\n\n')).toEqual([{ Entity: 'France', Code: 'FRA', Year: '1990', v: '0.5' }]);
  });
});
