'use client';

import * as React from 'react';

import { useMutate } from '~/core/sync/use-mutate';
import { useValue } from '~/core/sync/use-store';

export type EntityTextValue = {
  /**
   * `undefined` when the store holds no opinion — nothing synced and nothing staged, which is
   * also every render before the entity hydrates. `null` when the value has been cleared.
   *
   * Callers with a server-read fallback need that difference: a cleared value has to read as
   * gone, while an unhydrated one has to keep showing what the server already sent. Callers
   * without one can collapse both with `?? fallback`, since `null ?? x` is `x`.
   */
  value: string | null | undefined;
  /** Writing `''` deletes the value rather than storing an empty one. */
  setValue: (next: string) => void;
};

/**
 * One TEXT value on one entity in one space, read live and written back.
 *
 * Shared because the same field is now edited from more than one place — a profile's
 * description is read in the rail's About card and written from there, while every other
 * entity writes the same property from the header — and the two had to agree about what an
 * empty string means and what a tombstone means. See `EntityPageInlineDescription` and
 * `AboutSection`.
 *
 * Tombstones are read deliberately. Clearing a value replaces its row with an `isDeleted`
 * one rather than removing it, so a lookup that hid those could not tell "not hydrated yet"
 * from "just cleared" — and a server fallback would bring the cleared text straight back.
 */
export function useEntityTextValue({
  entityId,
  spaceId,
  propertyId,
  propertyName,
}: {
  /** `null` while the entity behind the surface is still being resolved. */
  entityId: string | null;
  spaceId: string;
  propertyId: string;
  /** Written onto the value's property so a fresh row is legible before the property hydrates. */
  propertyName: string;
}): EntityTextValue {
  const { storage } = useMutate();

  const stored = useValue({
    includeDeleted: true,
    selector: v =>
      entityId !== null && v.entity.id === entityId && v.spaceId === spaceId && v.property.id === propertyId,
  });

  const live = stored && !stored.isDeleted ? stored : undefined;

  const setValue = React.useCallback(
    (next: string) => {
      if (entityId === null) return;

      if (next === '') {
        // Nothing live to clear: either it was never written, or it is already a tombstone.
        if (live) storage.values.delete(live);
        return;
      }

      // Always `set`, never `update`. The row id is derived from entity + property + space, so
      // this addresses the same row either way — and `set` forces `isDeleted` back to false,
      // which is what lets someone type into a field they have just cleared.
      storage.values.set({
        spaceId,
        entity: { id: entityId, name: null },
        property: { id: propertyId, name: propertyName, dataType: 'TEXT' },
        value: next,
      });
    },
    [entityId, live, propertyId, propertyName, spaceId, storage]
  );

  return { value: stored ? (stored.isDeleted ? null : stored.value) : undefined, setValue };
}
