import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { TOPIC_TYPE_ID } from '~/core/constants';

import { customBrowseView, needsSpaceForView } from './entity-page-body';

/**
 * Which read surface an entity gets.
 *
 * Four views from four inputs that arrive at different times, which is why this
 * is a pure function with a test rather than a branch buried in a hook.
 *
 * The one this file was written for is **person**. A profile is assembled by the
 * `/space/<personal space>` route out of a layout header, a rail and a page
 * body, so every other door to the same person — the side panel a debate opens,
 * the `(entity)` full-page route — showed the generic value sheet instead. Both
 * of those render through `EntityPageBody`, so dispatching here covers both.
 */
const CLAIM_TYPE = { id: CLAIM_TYPE_ID };
const TOPIC_TYPE = { id: TOPIC_TYPE_ID };
const PERSON = { id: SystemIds.PERSON_TYPE };

const PERSON_ENTITY = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_ENTITY = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const personalSpace = (entityId = PERSON_ENTITY) =>
  ({ type: 'PERSONAL', entity: { id: entityId, types: [PERSON] } }) as never;

const daoSpace = (entityId = PERSON_ENTITY) => ({ type: 'DAO', entity: { id: entityId, types: [PERSON] } }) as never;

const view = (over: Partial<Parameters<typeof customBrowseView>[0]> = {}) =>
  customBrowseView({
    entityId: PERSON_ENTITY,
    entity: { types: [PERSON] },
    isLoadingEntity: false,
    space: personalSpace(),
    isLoadingSpace: false,
    isEditing: false,
    ...over,
  });

describe('customBrowseView', () => {
  it('gives a person in their own space the profile', () => {
    expect(view()).toBe('person');
  });

  /**
   * The check is the *space's*, not the type's.
   *
   * A Person entity written into a DAO space satisfies the type alone, and was
   * once handed profile tabs whose routes answered 404. There is no personal
   * record behind it to show.
   */
  it('does not give a Person inside a DAO space a profile', () => {
    expect(view({ space: daoSpace() })).toBe('generic');
  });

  /**
   * A personal space holds more than its owner. Only the space's own entity is
   * the profile; everything else in there is an ordinary entity.
   */
  it('does not give another entity in that space a profile', () => {
    expect(view({ entityId: OTHER_ENTITY })).toBe('generic');
  });

  /**
   * `person-pending`, not `pending`.
   *
   * The two are different instructions to the caller: `pending` draws nothing at
   * all, which is right when the entity's own types are unknown and the whole
   * page is in question. Here only the *body* is — a profile and an ordinary
   * Person entity have the same cover, avatar, name and bio — so the header is
   * drawn either way and only what follows it waits.
   *
   * Blanking the page instead made every Person in a DAO space wait out a space
   * read for a view it was never going to get.
   */
  it('holds back only the body while the space read is out', () => {
    expect(view({ space: null, isLoadingSpace: true })).toBe('person-pending');
  });

  it('falls through when the space could not be read at all', () => {
    expect(view({ space: null, isLoadingSpace: false })).toBe('generic');
  });

  /**
   * Only a Person waits for the space read. Everything else is answered from the
   * types alone, so the extra request gates nothing it does not have to.
   */
  it('does not hold a non-person back for the space', () => {
    expect(view({ entity: { types: [] }, space: null, isLoadingSpace: true })).toBe('generic');
  });

  it('leaves claims and topics as they were', () => {
    expect(view({ entity: { types: [CLAIM_TYPE] } })).toBe('claim');
    expect(view({ entity: { types: [TOPIC_TYPE] } })).toBe('topic');
  });

  /**
   * A claim wins over a person, as it already wins over a topic: an entity typed
   * both is read as the narrower of the two.
   */
  it('prefers the claim view for an entity typed as both', () => {
    expect(view({ entity: { types: [PERSON, CLAIM_TYPE] } })).toBe('claim');
  });

  it('keeps the claim surface while editing', () => {
    expect(view({ entity: { types: [CLAIM_TYPE] }, isEditing: true })).toBe('claim');
  });

  it('falls through to the generic page for other custom views while editing', () => {
    expect(view({ isEditing: true })).toBe('generic');
    expect(view({ entity: { types: [TOPIC_TYPE] }, isEditing: true })).toBe('generic');
  });

  it('draws nothing until the entity itself is known', () => {
    expect(view({ entity: null, isLoadingEntity: true })).toBe('pending');
  });

  it('matches ids however they are spelled', () => {
    const dashed = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    expect(view({ entityId: dashed })).toBe('person');
  });
});

/**
 * The query gate and the dispatch read one precedence.
 *
 * `useSpace` is enabled by this, and it used to restate the Person test on its
 * own — so an entity typed Person *and* Claim fetched a space the claim branch
 * was always going to discard. The cost was a wasted request; the risk was
 * worse, since a gate repeating a precedence it does not own drifts from it the
 * first time the precedence changes.
 *
 * The invariant is the point: the space is fetched exactly when the answer
 * depends on it.
 */
describe('needsSpaceForView', () => {
  const needs = (types: { id: string }[], isEditing = false) => needsSpaceForView({ entity: { types }, isEditing });

  it('asks for the space for a Person', () => {
    expect(needs([PERSON])).toBe(true);
  });

  it('does not ask for an entity the types already settle', () => {
    expect(needs([CLAIM_TYPE])).toBe(false);
    expect(needs([TOPIC_TYPE])).toBe(false);
    expect(needs([])).toBe(false);
  });

  it('does not ask when a higher-priority type wins over Person', () => {
    expect(needs([PERSON, CLAIM_TYPE])).toBe(false);
    expect(needs([PERSON, TOPIC_TYPE])).toBe(false);
  });

  it('does not ask while editing, which falls through to the generic page', () => {
    expect(needs([PERSON], true)).toBe(false);
  });

  it('has nothing to ask about before the entity arrives', () => {
    expect(needsSpaceForView({ entity: null, isEditing: false })).toBe(false);
  });

  /**
   * Stated as the invariant rather than case by case: the space is fetched
   * exactly when withholding it would change the answer.
   */
  it('is true exactly when the view would wait for the space', () => {
    const combinations = [[], [CLAIM_TYPE], [TOPIC_TYPE], [PERSON], [PERSON, CLAIM_TYPE], [PERSON, TOPIC_TYPE]];

    for (const types of combinations) {
      const withoutSpace = customBrowseView({
        entityId: PERSON_ENTITY,
        entity: { types },
        isLoadingEntity: false,
        space: null,
        isLoadingSpace: true,
        isEditing: false,
      });

      expect(needsSpaceForView({ entity: { types }, isEditing: false })).toBe(withoutSpace === 'person-pending');
    }
  });
});
