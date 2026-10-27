import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DATA_TYPE_PROPERTY } from '~/core/constants';
import { GeoStore, reactiveRelations } from '~/core/sync/store';
import { GeoEventStream } from '~/core/sync/stream';
import { createMutator } from '~/core/sync/use-mutate';
import type { Relation } from '~/core/types';

import { replacePropertyTypeRelation } from './properties';

// Break the store <-> sync-engine import cycle the same way `remap-space-id.test.ts` does. The
// mutator under test is built over its own store below, so the module-level one is never used.
vi.mock('~/core/sync/use-sync-engine', () => ({ store: {}, useSyncEngine: () => ({}) }));
vi.mock('~/core/sync/use-store', () => ({}));

// The real mutator, so these tests run `relations.update` itself — the thing that decides whether
// a relation's id can be kept — rather than a stand-in for it.
const { relations } = createMutator(new GeoStore(new GeoEventStream()));

const TEXT = '9edb6fcce4544aa5861139d7f024c010';
const RELATION = '4b6d9fc1fbfe474c861c83398e1b50d9';
const SPACE = 'a19c345ab9866679b001d7d2138d88a1';
const PROPERTY = { id: '0b9b1a35206844318f7d2350f958a728', name: 'Participants' };
const TYPE = { id: DATA_TYPE_PROPERTY, name: 'Data Type' };
const EXISTING_ID = '7b353b09f81948fcb75f87f3f73aa940';

/** The property's Data type relation pointing at Text, in whatever state the test needs. */
function textRelation(flags: Partial<Relation>): Relation {
  return {
    id: EXISTING_ID,
    entityId: '63e9b51b2cf44fe4912ced853274bc7b',
    spaceId: SPACE,
    position: 'a08X0',
    verified: false,
    renderableType: 'RELATION',
    type: TYPE,
    fromEntity: PROPERTY,
    toEntity: { id: TEXT, name: 'Text', value: TEXT },
    ...flags,
  };
}

function changeToRelation(existing: Relation | undefined) {
  replacePropertyTypeRelation(
    { existing, property: PROPERTY, spaceId: SPACE, type: TYPE, target: { id: RELATION, name: 'Relation' } },
    relations
  );
  const rows = reactiveRelations.get();
  return {
    live: rows.filter(r => !r.isDeleted),
    deleted: rows.filter(r => r.isDeleted),
  };
}

/** Deleted under its old id, and a new relation to Relation under a fresh id that will publish. */
function expectReplaced({ live, deleted }: ReturnType<typeof changeToRelation>) {
  expect(deleted.map(r => r.id)).toEqual([EXISTING_ID]);
  expect(live).toHaveLength(1);
  expect(live[0].id).not.toBe(EXISTING_ID);
  expect(live[0].toEntity).toMatchObject({ id: RELATION, value: RELATION });
  expect(live[0]).toMatchObject({ isLocal: true, hasBeenPublished: false });
  expect(live[0].isRelationUpdate).toBeFalsy();
}

beforeEach(() => {
  reactiveRelations.set(() => []);
});

describe('replacePropertyTypeRelation', () => {
  // Changing the type twice before publishing should leave one relation, not a trail of dead ones.
  it('changes a relation that has never been published in place', () => {
    const draft = textRelation({ isLocal: true, hasBeenPublished: false });
    reactiveRelations.set(() => [draft]);

    const { live, deleted } = changeToRelation(draft);

    expect(deleted).toEqual([]);
    expect(live).toHaveLength(1);
    expect(live[0].id).toBe(EXISTING_ID);
    expect(live[0].toEntity.id).toBe(RELATION);
  });

  // The Participants bug: created as Text and published, then changed to Relation in the same
  // session. The relation stays `isLocal` once published; reusing its id published a
  // `createRelation` the graph ignored, so the property stayed Text.
  it('replaces a relation published from this session', () => {
    const published = textRelation({ isLocal: true, hasBeenPublished: true });
    reactiveRelations.set(() => [published]);

    expectReplaced(changeToRelation(published));
  });

  it('replaces a relation loaded from the graph', () => {
    const remote = textRelation({ isLocal: false });
    reactiveRelations.set(() => [remote]);

    expectReplaced(changeToRelation(remote));
  });

  // A loaded relation already edited in this session (a reorder, say) is stored local and
  // unpublished but flagged `isRelationUpdate`; publishing it sends only `updateRelation`, which
  // can't carry a new target. It still exists on the graph, so it must be replaced too.
  it('replaces a loaded relation that already has a pending update', () => {
    const pending = textRelation({ isLocal: true, hasBeenPublished: false, isRelationUpdate: true });
    reactiveRelations.set(() => [pending]);

    expectReplaced(changeToRelation(pending));
  });

  it('creates the relation when there is none yet', () => {
    const { live, deleted } = changeToRelation(undefined);

    expect(deleted).toEqual([]);
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ fromEntity: PROPERTY, type: TYPE, spaceId: SPACE, toEntity: { id: RELATION } });
    expect(live[0].id).toMatch(/^[0-9a-f]{32}$/);
  });
});
