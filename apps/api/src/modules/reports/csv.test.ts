import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from './csv.js';

describe('csv', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('l1\nl2')).toBe('"l1\nl2"');
  });

  it('neutralizes spreadsheet formulas but keeps negative numbers', () => {
    expect(csvCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(csvCell('+1+1')).toBe("'+1+1");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('-5000')).toBe('-5000');
    expect(csvCell(-5000)).toBe('-5000');
  });

  it('writes header, BOM and CRLF rows', () => {
    const out = toCsv(
      ['a', 'b'],
      [
        { a: 1, b: 'x' },
        { a: null, b: 'y,z' },
      ],
    );
    expect(out).toBe('﻿a,b\r\n1,x\r\n,"y,z"\r\n');
  });
});
