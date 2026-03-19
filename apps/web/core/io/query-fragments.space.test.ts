import { print } from 'graphql';
import { describe, expect, it } from 'vitest';

import { spaceFragment, spaceQuery, spacesQuery } from './query-fragments';

describe('space query fragments', () => {
  it('includes topic data in the shared space fragment', () => {
    const fragment = print(spaceFragment);
    const singleSpaceQuery = print(spaceQuery);
    const collectionSpacesQuery = print(spacesQuery);

    expect(fragment).toContain('topic {');
    expect(fragment).toContain('page {');
    expect(fragment).toContain('topicId');
    expect(singleSpaceQuery).toContain('topic {');
    expect(collectionSpacesQuery).toContain('topic {');
  });
});
