import { describe, expect, it } from 'vitest';

import { splitRelationCell } from './relation-cell';

describe('splitRelationCell', () => {
  it('splits relation values by comma, semicolon, and pipe', () => {
    expect(splitRelationCell('Alice, Bob;Charlie | Delta')).toEqual(['Alice', 'Bob', 'Charlie', 'Delta']);
  });

  it('trims and removes empty parts', () => {
    expect(splitRelationCell(' , Alice ,, ; ; Bob | ')).toEqual(['Alice', 'Bob']);
  });
});

describe('splitRelationCell rules', () => {
  it('defaults to list, so existing callers are unaffected', () => {
    expect(splitRelationCell('Alice, Bob')).toEqual(['Alice', 'Bob']);
    expect(splitRelationCell('Alice, Bob', 'list')).toEqual(['Alice', 'Bob']);
  });

  it('keeps a name that contains commas whole under "none"', () => {
    // The case the earlier CSV pipeline patched by exempting city/country/place
    // properties by name. Same outcome, decided per column instead.
    expect(splitRelationCell('Chicago, Illinois, United States', 'none')).toEqual(['Chicago, Illinois, United States']);
  });

  it('splits on slashes under "slash"', () => {
    expect(splitRelationCell('ceo/founder', 'slash')).toEqual(['ceo', 'founder']);
  });

  it('still splits lists under "slash", since a column can hold both', () => {
    expect(splitRelationCell('ceo/founder, investor', 'slash')).toEqual(['ceo', 'founder', 'investor']);
  });

  it('does not split slashes under the default rule', () => {
    expect(splitRelationCell('ceo/founder')).toEqual(['ceo/founder']);
  });

  it('returns nothing for a blank cell under any rule', () => {
    expect(splitRelationCell('   ', 'none')).toEqual([]);
    expect(splitRelationCell('   ', 'slash')).toEqual([]);
  });
});
