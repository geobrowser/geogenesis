import { describe, expect, it } from 'vitest';

import { resolveGraphFilter } from '~/core/graph-explorer/graph-filter';

import { claimsEmptyMessage, descriptionEmptyMessage, relationshipsEmptyMessage } from './empty-states';

const SPACE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TOPIC = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

describe('empty states', () => {
  const scoped = resolveGraphFilter({ kind: 'spaces', spaceIds: [SPACE], topicId: TOPIC });
  const global = resolveGraphFilter({ kind: 'global' });

  it('says "knowledge graph" only when no spaces were filtered', () => {
    expect(relationshipsEmptyMessage(scoped)).toBe('No relationships of the shown types in this topic’s spaces yet.');
    expect(relationshipsEmptyMessage(global)).toBe('No relationships of the shown types in the knowledge graph yet.');
  });

  it('names the topic when claims must carry it, and the spaces when they need not', () => {
    expect(claimsEmptyMessage(scoped, 'Israel-Gaza war')).toBe('No claims about this in Israel-Gaza war yet.');
    expect(
      claimsEmptyMessage(
        resolveGraphFilter({ kind: 'spaces', spaceIds: [SPACE], topicId: TOPIC }, { claims: 'all' }),
        null
      )
    ).toBe('No claims in this topic’s spaces are linked to this yet.');
    expect(claimsEmptyMessage(global, null)).toBe('No claims in the knowledge graph are linked to this yet.');
  });

  it('says a description is missing from the space it was read in', () => {
    expect(descriptionEmptyMessage(SPACE)).toBe('No description in this space yet.');
    expect(descriptionEmptyMessage(null)).toBe('No description in the knowledge graph yet.');
  });
});
