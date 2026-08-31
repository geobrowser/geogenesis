import { describe, expect, it } from 'vitest';

import { type CoercionRule, coerce, coerceColumn, isCoercionRule, isPlaceholder, parseNumericString } from './coerce';

function value(rule: CoercionRule, raw: string): string | null {
  const result = coerce(rule, raw);
  return result.ok ? result.value : null;
}

function reason(rule: CoercionRule, raw: string): string | null {
  const result = coerce(rule, raw);
  return result.ok ? null : result.reason;
}

describe('the values that publish wrongly today', () => {
  // Each case here is a measured failure of `parseInt(val, 10) || 0` in
  // core/utils/publish/publish.ts:170. The middle column is what the graph
  // currently receives; the assertion is what it should receive instead.

  it('keeps a thousands separator from truncating the number', () => {
    // parseInt('2,015') === 2 — it stops at the comma. The graph gets `2`.
    expect(value('integer', '2,015')).toBe('2015');
  });

  it('reads a year out of prose instead of writing 0', () => {
    // parseInt('March 2015') === NaN, and `|| 0` turns that into a real zero.
    expect(value('integer:year', 'March 2015')).toBe('2015');
    expect(value('integer:year', 'circa 2015')).toBe('2015');
    expect(value('integer:year', 'c. 2015')).toBe('2015');
    expect(value('integer:year', 'founded 2015')).toBe('2015');
  });

  it('expands an exponent instead of truncating it', () => {
    // parseInt('1.5e3') === 1.
    expect(value('integer', '1.5e3')).toBe('1500');
  });

  it('writes nothing at all for missing data — never a zero', () => {
    // The heart of it. `0` is a measurement; absence is not. Publishing `0` for
    // "unknown" is a wrong fact stated confidently, and unrecoverable later.
    for (const missing of ['N/A', 'n/a', 'unknown', 'TBD', '-', '—', 'null', '', '   ', '?']) {
      expect(value('integer', missing), `${JSON.stringify(missing)} must not become a value`).toBeNull();
    }
  });

  it('separates "no data" from "could not read this"', () => {
    // Both write no value, but only one is worth mentioning to the user.
    expect(reason('integer', 'N/A')).toBe('placeholder');
    expect(reason('integer', 'sometime in the 90s')).toBe('unconvertible');
  });

  it('does not let one bad cell reach the DECIMAL path that throws', () => {
    // parseDecimalString runs BigInt(), which throws rather than returning 0 —
    // so a single unreadable cell fails the whole publish, not just its row.
    expect(value('decimal', 'circa 2015')).toBeNull();
    expect(value('decimal', 'N/A')).toBeNull();
  });

  it('closes the loop: what we emit survives the expression that mangles it today', () => {
    // Verbatim from core/utils/publish/publish.ts:170 — the line that turns a
    // raw cell into an on-chain integer. Copied rather than imported so this
    // test states the contract it is holding us to, and fails loudly if that
    // line ever changes shape.
    const publishInteger = (val: string) => parseInt(val, 10) || 0;

    // Only inputs `parseInt` genuinely mangles. The guard below rejects any
    // case that already works, so this list cannot quietly fill up with
    // examples that demonstrate nothing.
    const cases: Array<[raw: string, expected: number]> = [
      ['2,015', 2015], // parseInt stops at the comma → 2
      ['1.5e3', 1500], // parseInt stops at the dot → 1
      ['$1,234', 1234], // leading symbol → NaN → 0
      ['(1,234)', -1234], // accounting negative → NaN → 0
      ['1 234', 1234], // space grouping → 1
    ];

    for (const [raw, expected] of cases) {
      const coerced = value('integer', raw);
      expect(coerced, `${raw} should coerce`).not.toBeNull();
      expect(publishInteger(coerced as string), `${raw} through publish`).toBe(expected);
      // And the same input unconverted is what the bug looks like.
      if (publishInteger(raw) === expected) {
        throw new Error(`${raw} already published correctly — this case no longer proves anything`);
      }
    }
  });
});

describe('parseNumericString', () => {
  it('reads plain numbers', () => {
    expect(parseNumericString('2015')).toBe(2015);
    expect(parseNumericString('2015.5')).toBe(2015.5);
    expect(parseNumericString('-42')).toBe(-42);
    expect(parseNumericString('+42')).toBe(42);
    expect(parseNumericString('0')).toBe(0);
  });

  it('reads English grouping', () => {
    expect(parseNumericString('1,234')).toBe(1234);
    expect(parseNumericString('1,234,567')).toBe(1234567);
    expect(parseNumericString('1,234.56')).toBe(1234.56);
  });

  it('reads German grouping, where the separators are swapped', () => {
    // `1.234,56` and `1,234.56` are the same number written by different
    // countries. Resolved positionally — last separator is the decimal point —
    // so neither locale has to be detected.
    expect(parseNumericString('1.234,56')).toBe(1234.56);
    expect(parseNumericString('1.234.567,89')).toBe(1234567.89);
  });

  it('reads a comma used as a decimal point', () => {
    // One comma with fewer than three digits after it cannot be grouping.
    expect(parseNumericString('3,5')).toBe(3.5);
    expect(parseNumericString('0,75')).toBe(0.75);
  });

  it('treats a single comma before exactly three digits as grouping', () => {
    // The `2,015` case. Ambiguous in principle; grouping in practice.
    expect(parseNumericString('2,015')).toBe(2015);
  });

  it('reads spaces used as grouping', () => {
    expect(parseNumericString('1 234 567')).toBe(1234567);
    expect(parseNumericString('1 234')).toBe(1234);
  });

  it('strips currency and percent signs', () => {
    expect(parseNumericString('$1,234.56')).toBe(1234.56);
    expect(parseNumericString('€1.234,56')).toBe(1234.56);
    expect(parseNumericString('45%')).toBe(45);
  });

  it('reads accounting negatives', () => {
    expect(parseNumericString('(1,234)')).toBe(-1234);
  });

  it('reads exponents', () => {
    expect(parseNumericString('1.5e3')).toBe(1500);
    expect(parseNumericString('2E-3')).toBe(0.002);
  });

  it('refuses anything that is not a number', () => {
    for (const bad of ['', 'abc', 'March 2015', '12abc', '1.2.3.4', '--5']) {
      expect(parseNumericString(bad), bad).toBeNull();
    }
  });
});

describe('integer', () => {
  it('drops a trailing .0 that Excel adds to whole numbers', () => {
    expect(value('integer', '2015.0')).toBe('2015');
  });

  it('rounds rather than truncating', () => {
    expect(value('integer', '2015.7')).toBe('2016');
    expect(value('integer', '2015.2')).toBe('2015');
  });

  it('keeps zero, which is a real value', () => {
    expect(value('integer', '0')).toBe('0');
  });

  it('refuses a number too large to be exact', () => {
    expect(value('integer', '99999999999999999999')).toBeNull();
  });
});

describe('integer:year', () => {
  it('takes the first year from a range', () => {
    expect(value('integer:year', '2015-2017')).toBe('2015');
  });

  it('takes the year from a full date', () => {
    expect(value('integer:year', '2015-03-01')).toBe('2015');
    expect(value('integer:year', '2015-07-30T00:00:00.000Z')).toBe('2015');
  });

  it('reads a bare year', () => {
    expect(value('integer:year', '2015')).toBe('2015');
    expect(value('integer:year', '1999')).toBe('1999');
  });

  it('refuses text with no year in it', () => {
    expect(value('integer:year', 'sometime in the nineties')).toBeNull();
    expect(value('integer:year', 'last year')).toBeNull();
  });
});

describe('float and decimal', () => {
  it('keeps the fraction', () => {
    expect(value('float', '1,234.56')).toBe('1234.56');
    expect(value('decimal', '3,5')).toBe('3.5');
  });

  it('writes small magnitudes without an exponent', () => {
    // parseDecimalString calls BigInt() on the digits, and BigInt('1e-7')
    // throws. Anything handed to DECIMAL has to be in plain notation.
    const result = value('decimal', '0.0000001');
    expect(result).not.toBeNull();
    expect(result).not.toMatch(/e/i);
    expect(Number(result)).toBeCloseTo(1e-7);
  });
});

describe('boolean', () => {
  it('accepts the spellings parseCheckboxValue knows', () => {
    expect(value('boolean', 'true')).toBe('1');
    expect(value('boolean', 'Yes')).toBe('1');
    expect(value('boolean', 'Y')).toBe('1');
    expect(value('boolean', 'false')).toBe('0');
    expect(value('boolean', 'no')).toBe('0');
    expect(value('boolean', '0')).toBe('0');
  });

  it('refuses a value it cannot read as a checkbox', () => {
    expect(value('boolean', 'maybe')).toBeNull();
  });
});

describe('date', () => {
  it('reads ISO', () => {
    expect(value('date', '2015-03-01')).toBe('2015-03-01T00:00:00.000Z');
  });

  it('reads a bare year as the first of January', () => {
    expect(value('date', '2015')).toBe('2015-01-01T00:00:00.000Z');
  });

  it('resolves a slashed date when only one reading is possible', () => {
    // 25 cannot be a month, so this is unambiguous without being told.
    expect(value('date', '25/12/2020')).toBe('2020-12-25T00:00:00.000Z');
    expect(value('date', '12/25/2020')).toBe('2020-12-25T00:00:00.000Z');
  });

  it('refuses an ambiguous slashed date rather than guessing', () => {
    // 03/04/2015 is 3 April or 4 March depending on the country that wrote it.
    // Guessing writes a real, plausible, wrong date — the exact failure mode
    // this module exists to prevent. The model picks date:dmy or date:mdy from
    // the column's samples instead.
    expect(value('date', '03/04/2015')).toBeNull();
    expect(reason('date', '03/04/2015')).toBe('unconvertible');
  });

  it('follows the ordering when the model has chosen one', () => {
    expect(value('date:dmy', '03/04/2015')).toBe('2015-04-03T00:00:00.000Z');
    expect(value('date:mdy', '03/04/2015')).toBe('2015-03-04T00:00:00.000Z');
  });

  it('refuses a date that does not exist', () => {
    // Date.UTC rolls 31 February forward into March rather than failing.
    expect(value('date', '2015-02-31')).toBeNull();
    expect(value('date:dmy', '31/02/2015')).toBeNull();
  });

  it('refuses text that is not a date', () => {
    expect(value('date', 'sometime')).toBeNull();
  });
});

describe('time', () => {
  it('reads 24-hour times', () => {
    expect(value('time', '14:30')).toBe('1970-01-01T14:30:00.000Z');
    expect(value('time', '14:30:15')).toBe('1970-01-01T14:30:15.000Z');
  });

  it('reads am/pm', () => {
    expect(value('time', '2:30 pm')).toBe('1970-01-01T14:30:00.000Z');
    expect(value('time', '12:00 am')).toBe('1970-01-01T00:00:00.000Z');
    expect(value('time', '12:00 pm')).toBe('1970-01-01T12:00:00.000Z');
  });

  it('refuses an impossible time', () => {
    expect(value('time', '25:00')).toBeNull();
    expect(value('time', '10:75')).toBeNull();
  });
});

describe('text', () => {
  it('passes through, trimmed', () => {
    expect(value('text', '  Ethereum  ')).toBe('Ethereum');
  });

  it('still drops placeholders — "N/A" is not a description', () => {
    expect(value('text', 'N/A')).toBeNull();
    expect(value('text', 'unknown')).toBeNull();
  });

  it('keeps text that merely contains a placeholder word', () => {
    // The list matches whole cells only; a sentence is real content.
    expect(value('text', 'Unknown Pleasures')).toBe('Unknown Pleasures');
    expect(value('text', 'None of the above applies here')).toBe('None of the above applies here');
  });
});

describe('isPlaceholder', () => {
  it('is case- and space-insensitive', () => {
    expect(isPlaceholder('  N/A  ')).toBe(true);
    expect(isPlaceholder('TBD')).toBe(true);
    expect(isPlaceholder('tbd')).toBe(true);
  });

  it('does not match real values', () => {
    expect(isPlaceholder('0')).toBe(false);
    expect(isPlaceholder('false')).toBe(false);
    expect(isPlaceholder('Ethereum')).toBe(false);
  });
});

describe('isCoercionRule', () => {
  it('accepts every rule in the closed set', () => {
    expect(isCoercionRule('integer:year')).toBe(true);
    expect(isCoercionRule('date:dmy')).toBe(true);
  });

  it('rejects anything the model might invent', () => {
    // The set is closed precisely so a hallucinated rule fails validation
    // rather than silently falling through to a default.
    expect(isCoercionRule('integer:quarter')).toBe(false);
    expect(isCoercionRule('smart')).toBe(false);
    expect(isCoercionRule(null)).toBe(false);
  });
});

describe('coerceColumn', () => {
  it('reports converted, missing, and unreadable separately', () => {
    const { values, report } = coerceColumn('integer:year', ['2015', 'N/A', 'March 2016', 'sometime', '2018']);

    expect(values).toEqual(['2015', null, '2016', null, '2018']);
    expect(report).toMatchObject({ converted: 3, placeholder: 1, unconvertible: 1 });
  });

  it('collects examples so the report can show rather than assert', () => {
    const { report } = coerceColumn('integer', ['abc', 'def', 'ghi', 'jkl']);

    expect(report.examples).toEqual(['abc', 'def', 'ghi']);
  });

  it('does not repeat the same bad value in its examples', () => {
    const { report } = coerceColumn('integer', ['abc', 'abc', 'abc']);

    expect(report.examples).toEqual(['abc']);
    expect(report.unconvertible).toBe(3);
  });

  it('keeps positions aligned so a null does not shift later rows', () => {
    const { values } = coerceColumn('integer', ['1', 'N/A', '3']);

    expect(values).toHaveLength(3);
    expect(values[2]).toBe('3');
  });
});
