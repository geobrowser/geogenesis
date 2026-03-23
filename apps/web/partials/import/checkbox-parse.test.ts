import { describe, expect, it } from 'vitest';

import { parseCheckboxValue } from './checkbox-parse';

describe('parseCheckboxValue', () => {
  it.each([
    ['1', true],
    ['true', true],
    ['True', true],
    ['TRUE', true],
    ['yes', true],
    ['Yes', true],
    ['y', true],
    ['Y', true],
    ['on', true],
    ['ON', true],
  ])('parses "%s" as true', (input, expected) => {
    const result = parseCheckboxValue(input);
    expect(result).toEqual({ parsed: true, value: expected });
  });

  it.each([
    ['0', false],
    ['false', false],
    ['False', false],
    ['FALSE', false],
    ['no', false],
    ['No', false],
    ['n', false],
    ['N', false],
    ['off', false],
    ['OFF', false],
  ])('parses "%s" as false', (input, expected) => {
    const result = parseCheckboxValue(input);
    expect(result).toEqual({ parsed: true, value: expected });
  });

  it('trims whitespace before parsing', () => {
    expect(parseCheckboxValue('  true  ')).toEqual({ parsed: true, value: true });
    expect(parseCheckboxValue(' 0 ')).toEqual({ parsed: true, value: false });
  });

  it.each(['', 'maybe', '2', 'yep', 'nah', 'checked', 'unchecked'])(
    'returns parsed: false for unparseable value "%s"',
    input => {
      expect(parseCheckboxValue(input)).toEqual({ parsed: false });
    }
  );
});
