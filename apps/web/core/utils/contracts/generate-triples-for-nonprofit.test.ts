import { describe, expect, it } from 'vitest';

import { generateTriplesForNonprofit } from './generate-triples-for-nonprofit';

describe('Generating triples in a nonprofit space', () => {
  it('generates initial content template', () => {
    expect(generateTriplesForNonprofit('spaceConfigEntityId', 'spaceName', 'spaceAddress')).toMatchSnapshot();
  });
});
