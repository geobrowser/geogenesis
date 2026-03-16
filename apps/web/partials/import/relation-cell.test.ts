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
