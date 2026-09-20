import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Value } from '~/core/types';

// `vi.mock` is hoisted, so this stands in for the sync engine before the module under test
// imports it. Mirrors the shape `edit-dispatcher.test.ts` uses.
const storage = {
  values: { set: vi.fn(), delete: vi.fn(), get: vi.fn() },
  relations: { set: vi.fn(), delete: vi.fn() },
  properties: { create: vi.fn(), setDataType: vi.fn() },
  entities: { name: { set: vi.fn() } },
  images: { createAndLink: vi.fn() },
};
vi.mock('~/core/sync/use-mutate', () => ({ storage }));

// Dynamic, so the `vi.mock` factory above is in place before the module under test binds
// `storage` — a static import is hoisted above the `const` and would read it uninitialised.
const { applyInjectOpsToStore } = await import('./apply-inject-ops');
type SerializedOp = import('./inject-types').SerializedOp;

const SPACE = 'space-1';
const STORY = 'story-entity-id';
const DESCRIPTION = 'description-property-id';

function text(value: string) {
  return { type: 'text', value } as const;
}

function named(id: string, name: string): SerializedOp {
  return { type: 'createEntity', id, values: [{ property: SystemIds.NAME_PROPERTY, value: text(name) }] };
}

beforeEach(() => {
  vi.clearAllMocks();
  storage.values.get.mockReturnValue(null);
});

describe('applyInjectOpsToStore — fresh ingest', () => {
  it('takes the first named createEntity as the primary, and counts the rest as supporting', () => {
    const result = applyInjectOpsToStore([named(STORY, 'The story'), named('person-1', 'A person')], SPACE);

    expect(result.primaryEntityId).toBe(STORY);
    expect(result.primaryEntityName).toBe('The story');
    expect(result.primaryWasCreated).toBe(true);
    expect(result.entitiesCreated).toBe(2);
    expect(result.entitiesUpdated).toBe(0);
  });
});

describe('applyInjectOpsToStore — enrich (GEO-2983)', () => {
  // The whole point: an enrich carries no named createEntity for the story, because the story is
  // already on-chain. Before this was handled the ops fell through to `default` and were counted
  // as skipped, so every value the enrich contributed was dropped.
  const enrich: SerializedOp[] = [
    { type: 'updateEntity', id: STORY, set: [{ property: DESCRIPTION, value: text('A fuller summary') }], unset: [] },
    { type: 'createRelation', id: 'rel-1', relationType: 'sources-property', from: STORY, to: 'source-1' },
  ];

  it('stages the updated values instead of skipping them', () => {
    const result = applyInjectOpsToStore(enrich, SPACE);

    expect(result.entitiesUpdated).toBe(1);
    expect(result.valuesSet).toBe(1);
    expect(result.skipped).toBe(0);
    expect(storage.values.set).toHaveBeenCalledWith(
      expect.objectContaining({ entity: { id: STORY, name: null }, value: 'A fuller summary' })
    );
  });

  it('resolves the primary from the updateEntity target, so the reader gets a pill and a destination', () => {
    const result = applyInjectOpsToStore(enrich, SPACE);

    expect(result.primaryEntityId).toBe(STORY);
    expect(result.primaryWasCreated).toBe(false);
    // Nothing restated the name, so the caller falls back to the job's.
    expect(result.primaryEntityName).toBeNull();
  });

  it('uses a restated name when the enrich does carry one', () => {
    const result = applyInjectOpsToStore(
      [{ type: 'updateEntity', id: STORY, set: [{ property: SystemIds.NAME_PROPERTY, value: text('Renamed') }], unset: [] }],
      SPACE
    );

    expect(result.primaryEntityName).toBe('Renamed');
    expect(storage.entities.name.set).toHaveBeenCalledWith(STORY, SPACE, 'Renamed');
  });

  it('falls back to the pre-existing relation parent when there is no updateEntity', () => {
    const result = applyInjectOpsToStore(
      [
        named('claim-1', 'A claim'),
        { type: 'createRelation', id: 'rel-1', relationType: 'claims-property', from: STORY, to: 'claim-1' },
      ],
      SPACE
    );

    // `claim-1` is created here, so it is not the target; STORY is never created, so it is.
    expect(result.primaryEntityId).toBe('claim-1');
  });

  it('refuses to guess when two different pre-existing parents are related to', () => {
    const result = applyInjectOpsToStore(
      [
        { type: 'createRelation', id: 'rel-1', relationType: 'p', from: 'pre-existing-a', to: 'x' },
        { type: 'createRelation', id: 'rel-2', relationType: 'p', from: 'pre-existing-b', to: 'y' },
      ],
      SPACE
    );

    expect(result.primaryEntityId).toBeNull();
  });
});

describe('applyInjectOpsToStore — unset', () => {
  it('clears a staged value when the unset covers every language', () => {
    const existing = { id: 'value-1', entity: { id: STORY, name: null } } as unknown as Value;
    storage.values.get.mockReturnValue(existing);

    const result = applyInjectOpsToStore(
      [{ type: 'updateEntity', id: STORY, set: [], unset: [{ property: DESCRIPTION, language: { type: 'all' } }] }],
      SPACE
    );

    expect(storage.values.delete).toHaveBeenCalledWith(existing);
    expect(result.valuesUnset).toBe(1);
  });

  it('leaves a language-specific unset alone rather than clearing the property outright', () => {
    const existing = { id: 'value-1', entity: { id: STORY, name: null } } as unknown as Value;
    storage.values.get.mockReturnValue(existing);

    const result = applyInjectOpsToStore(
      [
        {
          type: 'updateEntity',
          id: STORY,
          set: [],
          unset: [{ property: DESCRIPTION, language: { type: 'specific', language: 'fr' } }],
        },
      ],
      SPACE
    );

    expect(storage.values.delete).not.toHaveBeenCalled();
    expect(result.valuesUnset).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('is a no-op when there is no local value to clear', () => {
    const result = applyInjectOpsToStore(
      [{ type: 'updateEntity', id: STORY, set: [], unset: [{ property: DESCRIPTION, language: { type: 'all' } }] }],
      SPACE
    );

    expect(storage.values.delete).not.toHaveBeenCalled();
    expect(result.valuesUnset).toBe(0);
  });
});
