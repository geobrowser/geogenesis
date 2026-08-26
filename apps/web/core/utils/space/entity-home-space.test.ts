import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { SCORE_SYSTEM_PROPERTY } from '~/core/constants';

import { entityHomeSpaceId, resolveEntitySpaceId } from './entity-home-space';

/** Ranked 3 in the fixed space ranking; the claims on the curated pages live here. */
const AI_SPACE = '41e851610e13a19441c4d980f2f2ce6b';
/** Ranked 0. Outranks every other space, which is what makes `spaces[0]` the wrong answer. */
const ROOT_SPACE = 'a19c345ab9866679b001d7d2138d88a1';
/** Unranked, as every personal space is. */
const PERSONAL_SPACE = 'f3dab79cb5a3d9d1759656dd5361d1c6';

function named(spaceId: string, name = 'AI democracies should share computer chips.') {
  return { property: { id: SystemIds.NAME_PROPERTY }, spaceId, value: name, isDeleted: false };
}

/** Ranked 8, so it loses to Root — but only if Root's id is recognised by the ranking. */
const PODCASTS_SPACE = 'b5a31f8182b042437ede0f84ee02f104';

/** Any value that is not a name — enough to place the entity in a space without naming it there. */
function content(spaceId: string) {
  return { property: { id: '5c9b4c4b1e1c4a6f9d3f6c2a8b7e0d11' }, spaceId, value: 'x', isDeleted: false };
}

/** The per-space curation score. Hidden, and the one value a space holds without the entity
 * having any content there — the backend writes it wherever the entity was voted on. */
function score(spaceId: string) {
  return { property: { id: SCORE_SYSTEM_PROPERTY }, spaceId, value: '3', isDeleted: false };
}

describe('entityHomeSpaceId', () => {
  it('prefers a space the entity is named in over a higher-ranked one that merely cites it', () => {
    const entity = { spaces: [ROOT_SPACE, AI_SPACE], values: [named(AI_SPACE)] };

    expect(entityHomeSpaceId(entity)).toBe(AI_SPACE);
  });

  // The name value gets copied when a claim is cited, so more than one space naming it is ordinary.
  // Picking by rank rather than by iteration order is what keeps the answer stable: `entity.values`
  // is re-partitioned on every store merge.
  it('picks the highest-ranked space among the ones naming it', () => {
    const entity = { spaces: [ROOT_SPACE, AI_SPACE], values: [named(AI_SPACE), named(ROOT_SPACE)] };

    expect(entityHomeSpaceId(entity)).toBe(ROOT_SPACE);
  });

  it('falls back to the top-ranked space when the entity is named nowhere', () => {
    expect(entityHomeSpaceId({ spaces: [PERSONAL_SPACE, AI_SPACE] })).toBe(AI_SPACE);
  });

  // The rejected names sit in the *higher*-ranked spaces on purpose: if either guard stopped
  // working, those spaces would enter the named set and ROOT would win.
  it('ignores a deleted or blank name', () => {
    const entity = {
      spaces: [ROOT_SPACE, AI_SPACE, PERSONAL_SPACE],
      values: [{ ...named(ROOT_SPACE), isDeleted: true }, named(AI_SPACE, '   '), named(PERSONAL_SPACE)],
    };

    expect(entityHomeSpaceId(entity)).toBe(PERSONAL_SPACE);
  });

  it('answers null for an entity in no space at all', () => {
    expect(entityHomeSpaceId({ spaces: [] })).toBeNull();
  });
});

describe('resolveEntitySpaceId', () => {
  // Every ordinary row and every entity page: the space asked for is a space the entity is in.
  it('keeps the requested space when the entity holds content there', () => {
    const entity = { spaces: [AI_SPACE, PERSONAL_SPACE], values: [named(AI_SPACE), content(PERSONAL_SPACE)] };

    expect(resolveEntitySpaceId(entity, PERSONAL_SPACE)).toBe(PERSONAL_SPACE);
  });

  // `entity.spaces` also counts relations authored *from* the entity, so one Topics link added from
  // the curating space would otherwise satisfy the residency test and hand back the very space this
  // exists to correct.
  it('does not treat a space the entity merely appears in as its own', () => {
    const entity = { spaces: [ROOT_SPACE, AI_SPACE], values: [named(AI_SPACE)] };

    expect(resolveEntitySpaceId(entity, ROOT_SPACE)).toBe(AI_SPACE);
  });

  // `store.getEntity` derives `spaces` before applying the caller's `includeDeleted` filter, so a
  // tombstoned draft would place the entity in a space for one reader and not another — and the two
  // controls on a claim row read the entity with different flags.
  it('ignores tombstoned content when placing the entity', () => {
    const entity = {
      spaces: [AI_SPACE, PERSONAL_SPACE],
      values: [named(AI_SPACE), { ...content(PERSONAL_SPACE), isDeleted: true }],
    };

    expect(resolveEntitySpaceId(entity, PERSONAL_SPACE)).toBe(AI_SPACE);
  });

  // The reported bug: a claim collected onto a curated page in a personal space, with no target
  // space pinned on the collection item, arrived here as that personal space.
  it('resolves to the entity’s own space when the requested space holds nothing of it', () => {
    const entity = { spaces: [AI_SPACE], values: [named(AI_SPACE)] };

    expect(resolveEntitySpaceId(entity, PERSONAL_SPACE)).toBe(AI_SPACE);
  });

  it('compares spaces regardless of dashes and case', () => {
    const entity = { spaces: ['41E85161-0E13-A194-41C4-D980F2F2CE6B'], values: [] };

    expect(resolveEntitySpaceId(entity, AI_SPACE)).toBe(AI_SPACE);
  });

  /**
   * The curation Score is written per space by the backend when an entity is voted on there, and
   * `Entities.spaces` excludes it for exactly this reason. Without the same exclusion the fix
   * defeats itself: a claim that read its responses against the listing space *before* this branch
   * already carries a Score there, so that space would read as home and the wrong-space tally would
   * stay wrong for the claims the bug report is about.
   */
  it('does not let a hidden score value place the entity in a space', () => {
    const entity = {
      spaces: [AI_SPACE, PERSONAL_SPACE],
      values: [named(AI_SPACE), score(PERSONAL_SPACE)],
    };

    expect(resolveEntitySpaceId(entity, PERSONAL_SPACE)).toBe(AI_SPACE);
  });

  /**
   * `entityHomeSpaceId` only ranks spaces the entity is *named* in, which is narrower than the
   * residency test above — a claim-picker row whose name decoded to null has none. Answering the
   * requested space there would hand back the very space just rejected for holding nothing.
   */
  it('falls back to a space it does hold content in rather than the rejected one', () => {
    const entity = { spaces: [], values: [content(AI_SPACE)] };

    expect(resolveEntitySpaceId(entity, PERSONAL_SPACE)).toBe(AI_SPACE);
  });

  // Callers gate their own requests on loading; guessing before `spaces` is known would key them
  // on a space we may be about to leave.
  it('holds the requested space while the entity is unresolved', () => {
    expect(resolveEntitySpaceId(null, PERSONAL_SPACE)).toBe(PERSONAL_SPACE);
    expect(resolveEntitySpaceId({ spaces: [] }, PERSONAL_SPACE)).toBe(PERSONAL_SPACE);
  });
});

/**
 * The ranking is a plain object lookup keyed on undashed lowercase hex, so an id arriving in any
 * other form scores `UNRANKED` — and REST hands back the same bytes either way
 * (`core/io/rest/validation.ts`). Unranked is also the rank every personal space shares, so ties
 * are the common case, not the exotic one.
 */
describe('space ranking through entityHomeSpaceId', () => {
  it('ranks a dashed id the same as its undashed form', () => {
    const dashedRoot = 'a19c345a-b986-6679-b001-d7d2138d88a1';
    const entity = { spaces: [], values: [named(PODCASTS_SPACE), named(dashedRoot)] };

    expect(entityHomeSpaceId(entity)).toBe(dashedRoot);
  });

  // `entity.values` is re-partitioned on every store merge, so an answer that depended on its order
  // would flip between renders — taking the query keys and gateway scopes derived from it along.
  it('breaks a tie the same way whichever order the spaces arrive in', () => {
    const otherPersonal = 'b7c1d2e3f4a5968778695a4b3c2d1e0f';
    const forwards = entityHomeSpaceId({ spaces: [], values: [named(PERSONAL_SPACE), named(otherPersonal)] });
    const backwards = entityHomeSpaceId({ spaces: [], values: [named(otherPersonal), named(PERSONAL_SPACE)] });

    expect(forwards).toBe(backwards);
  });
});
