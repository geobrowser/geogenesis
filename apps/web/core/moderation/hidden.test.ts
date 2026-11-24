import { describe, expect, it } from 'vitest';

import type { Entity } from '~/core/types';

import { HIDDEN_PROPERTY_ID, isHiddenEntity, isHiddenInSpace, isHiddenMarker } from './hidden';

const value = (propertyId: string, raw: string) =>
  ({
    id: `v-${propertyId}-${raw}`,
    entity: { id: 'e1', name: null },
    property: { id: propertyId, name: 'Hidden', dataType: 'BOOLEAN' },
    value: raw,
    spaceId: 's1',
  }) as unknown as Entity['values'][number];

const entity = (values: Entity['values']) => ({ values }) as Pick<Entity, 'values'>;

describe('isHiddenEntity', () => {
  it('is true for the marker set to true', () => {
    expect(isHiddenEntity(entity([value(HIDDEN_PROPERTY_ID, 'true')]))).toBe(true);
  });

  // The backend has been seen to serialise BOOLEAN both ways; accepting only one silently
  // un-hides every entity the moment the other spelling shows up.
  it("accepts '1' as well as 'true', in any casing, with surrounding space", () => {
    expect(isHiddenEntity(entity([value(HIDDEN_PROPERTY_ID, '1')]))).toBe(true);
    expect(isHiddenEntity(entity([value(HIDDEN_PROPERTY_ID, ' TRUE ')]))).toBe(true);
  });

  it('is false when the marker is explicitly false', () => {
    expect(isHiddenEntity(entity([value(HIDDEN_PROPERTY_ID, 'false')]))).toBe(false);
    expect(isHiddenEntity(entity([value(HIDDEN_PROPERTY_ID, '0')]))).toBe(false);
  });

  it('ignores other properties, including truthy ones', () => {
    expect(isHiddenEntity(entity([value('8f151ba4de204e3c9cb499ddf96f48f1', 'true')]))).toBe(false);
  });

  // A 404 is destructive to reach for on bad input: absent or unreadable data must render.
  it('is false for an entity with no values, and for null', () => {
    expect(isHiddenEntity(entity([]))).toBe(false);
    expect(isHiddenEntity(null)).toBe(false);
    expect(isHiddenEntity(undefined)).toBe(false);
    expect(isHiddenEntity({} as Pick<Entity, 'values'>)).toBe(false);
  });
});

describe('isHiddenMarker', () => {
  it('reads an API value by its text or its boolean, and a store value as is', () => {
    expect(isHiddenMarker({ text: 'true', boolean: null })).toBe(true);
    expect(isHiddenMarker({ text: ' 1 ', boolean: null })).toBe(true);
    expect(isHiddenMarker({ text: null, boolean: true })).toBe(true);
    expect(isHiddenMarker({ text: 'false', boolean: false })).toBe(false);
    expect(isHiddenMarker({ text: null, boolean: null })).toBe(false);
    expect(isHiddenMarker('TRUE')).toBe(true);
    expect(isHiddenMarker(true)).toBe(true);
    expect(isHiddenMarker(null)).toBe(false);
  });
});

describe('isHiddenInSpace', () => {
  const S1 = '11111111111111111111111111111111';
  const inS1 = { ...value(HIDDEN_PROPERTY_ID, 'true'), spaceId: '11111111-1111-1111-1111-111111111111' };
  it('counts only the marker written in the given space, or in any space with none given', () => {
    expect(isHiddenInSpace(entity([inS1]), S1)).toBe(true);
    expect(isHiddenInSpace(entity([inS1]), '2'.repeat(32))).toBe(false);
    expect(isHiddenInSpace(entity([inS1]), null)).toBe(true);
    expect(isHiddenInSpace(null, S1)).toBe(false);
  });
});
