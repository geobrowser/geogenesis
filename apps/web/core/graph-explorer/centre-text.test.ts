import { describe, expect, it } from 'vitest';

import { centreTextInSpace } from './centre-text';
import type { GraphCentre } from './graph-entity';

const NAME = 'a126ca530c8e48d5b88882c734c38935';
const DESCRIPTION = '9b1f76ff9711404c861e59dc3fa7d037';
const WORLD = '89bd89bf28ff8a0963faf92a8c905e20';
const PODCASTS = 'b5a31f8182b042437ede0f84ee02f104';
const OTHER = 'cccccccccccccccccccccccccccccccc';

const centre: GraphCentre = {
  id: '4ed3162278994f29bde7a6f7cf60e28e',
  name: 'Graph-wide name',
  description: 'Graph-wide description',
  spaceIds: [WORLD, PODCASTS],
  types: [],
  image: null,
  namedSpaceIds: [WORLD, PODCASTS],
  texts: [
    { propertyId: NAME, spaceId: WORLD, text: 'Israel-Gaza war' },
    { propertyId: DESCRIPTION, spaceId: WORLD, text: 'Armed conflict centered on the Gaza Strip.' },
    { propertyId: NAME, spaceId: PODCASTS, text: 'Gaza war' },
    { propertyId: DESCRIPTION, spaceId: PODCASTS, text: 'The war between Israel and Hamas.' },
  ],
};

describe('centreTextInSpace', () => {
  it('reads the name and description the chosen space wrote', () => {
    expect(centreTextInSpace(centre, WORLD)).toEqual({
      name: 'Israel-Gaza war',
      description: 'Armed conflict centered on the Gaza Strip.',
    });
    expect(centreTextInSpace(centre, PODCASTS).description).toBe('The war between Israel and Hamas.');
  });

  it('borrows a name but never another space’s description', () => {
    const text = centreTextInSpace(centre, OTHER);
    expect(text.name).not.toBeNull();
    expect(text.description).toBeNull();
  });

  it('uses the graph-wide text when no space was chosen', () => {
    expect(centreTextInSpace(centre, null)).toEqual({ name: 'Graph-wide name', description: 'Graph-wide description' });
  });
});
