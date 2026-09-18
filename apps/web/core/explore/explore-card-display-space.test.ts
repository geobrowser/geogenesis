import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { normId } from '~/core/utils/norm-id';

import { type ExploreCardEntity, buildExploreFeedRows } from './explore-card-item';

/**
 * Which space's version of an entity a card renders (GEO-2859).
 *
 * The same entity can sit in several spaces and be a real, typed record in only
 * one of them — a personal space routinely carries a copy with a name and
 * nothing else. `entity.spaces` lists that copy first often enough to matter,
 * and picking it renders a claim whose card does not know it is a claim: the
 * feed's dispatcher reads the types of the space it was given, so an untyped
 * copy silently becomes a generic card with no Agree/Disagree on it.
 *
 * Reported twice on the same profile before the cause was found. The first fix
 * — read the space the person voted in — was right and not sufficient: they had
 * answered that claim in *both* spaces, so the newest vote still landed on the
 * untyped copy.
 */
const CLAIM_TYPE = 'c1a1c1a1c1a1c1a1c1a1c1a1c1a1c1a1';
const PERSONAL = 'cc31e40f74231d530f1b5d0fc1cd94d8';
const TOPIC = '224406e0de1e40d9a0c4f6a2e4f3b1c7';

function entity(spaces: string[], typedIn: string[]): ExploreCardEntity {
  return {
    id: 'dbe3bd040add4c62ad0c57ef770f2563',
    name: 'Age-gap relationships are fundamentally unhealthy',
    description: null,
    spaces,
    types: [],
    values: [],
    relations: typedIn.map(spaceId => ({
      id: `rel-${spaceId}`,
      spaceId,
      type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
      fromEntity: { id: 'dbe3bd040add4c62ad0c57ef770f2563', name: null },
      toEntity: { id: CLAIM_TYPE, name: 'Claim', value: '', type: 'ENTITY' },
      index: 'a0',
    })),
    commentCount: 0,
  } as unknown as ExploreCardEntity;
}

const rowFor = (e: ExploreCardEntity, allowed: string[]) =>
  buildExploreFeedRows([e], new Set(allowed.map(normId)), new Set())[0];

describe('the space a card renders in', () => {
  it('prefers a space the entity is actually typed in', () => {
    // `spaces` lists the untyped personal copy first, which is the whole bug.
    const row = rowFor(entity([PERSONAL, TOPIC], [TOPIC]), [PERSONAL, TOPIC]);

    expect(normId(row.spaceId)).toBe(normId(TOPIC));
  });

  it('carries that space’s types, which is what makes it a claim card', () => {
    const row = rowFor(entity([PERSONAL, TOPIC], [TOPIC]), [PERSONAL, TOPIC]);

    expect(row.types.map(type => type.name)).toEqual(['Claim']);
  });

  it('keeps the graph’s own order between two equally typed spaces', () => {
    const row = rowFor(entity([PERSONAL, TOPIC], [PERSONAL, TOPIC]), [PERSONAL, TOPIC]);

    expect(normId(row.spaceId)).toBe(normId(PERSONAL));
  });

  /*
   * The caller's set still wins. Narrowing to a space is a request — a reader
   * who filtered to one space gets a card in it, typed or not — so this only
   * ever chooses *between* spaces the caller allowed.
   */
  it('does not leave the space the caller asked for', () => {
    const row = rowFor(entity([PERSONAL, TOPIC], [TOPIC]), [PERSONAL]);

    expect(normId(row.spaceId)).toBe(normId(PERSONAL));
  });

  it('falls back to an untyped space when none of them is typed', () => {
    const row = rowFor(entity([PERSONAL, TOPIC], []), [PERSONAL, TOPIC]);

    expect(normId(row.spaceId)).toBe(normId(PERSONAL));
  });
});
