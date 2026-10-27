'use client';

import * as React from 'react';

import { useMutate } from '~/core/sync/use-mutate';
import { useValue } from '~/core/sync/use-store';

export type EntityTextValue = {
  /** What to show: the stored value, else the fallback, else empty. Never null or undefined. */
  text: string;
  /** Writing `''` deletes the value rather than storing an empty one. */
  setValue: (next: string) => void;
};

/**
 * One TEXT value on one entity in one space, read live and written back.
 *
 * Shared because the same field is now edited from more than one place — a profile's
 * description is read in the rail's About card and written from there, while every other
 * entity writes the same property from the header — and the two had to agree about what an
 * empty string means and what a tombstone means. Callers: `EntityPageInlineDescription`,
 * `AboutSection` and `PersonalSpaceTagline`.
 *
 * Tombstones are read deliberately, and resolving `fallback` against them is the reason this
 * returns `text` rather than the raw row. Clearing a value replaces its row with an `isDeleted`
 * one rather than removing it, so three states reach this function and only two of them are
 * the same:
 *
 * - **no row at all** — nothing synced and nothing staged, which is also every render before
 *   the entity hydrates. Falls back, because a caller's `fallback` is what the server already
 *   read and the alternative is a field that paints blank and then fills in.
 * - **a tombstone** — cleared. Does *not* fall back. It used to: every caller wrote
 *   `value ?? fallback` and so put the cleared text straight back on screen, where clearing it
 *   again was a no-op, because the row that would be deleted was already a tombstone. The
 *   description could not be deleted at all in a side panel that passed a preview.
 * - **a live row** — its value.
 */
export function useEntityTextValue({
  entityId,
  spaceId,
  propertyId,
  propertyName,
  fallback,
}: {
  /** `null` while the entity behind the surface is still being resolved. */
  entityId: string | null;
  spaceId: string;
  propertyId: string;
  /** Written onto the value's property so a fresh row is legible before the property hydrates. */
  propertyName: string;
  /** What the server already read, shown until the store has an opinion of its own. */
  fallback?: string | null;
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
        // Nothing live to clear: it was never written, it is already a tombstone, or — the one
        // case that is not a no-op in spirit — the entity has not hydrated yet and the field is
        // showing the caller's fallback. Clearing that is dropped, and the value reappears when
        // the row arrives.
        //
        // Left alone deliberately. Tombstoning the derived id regardless would stage a deletion
        // for a row nothing has confirmed exists, and publishing that is a delete op against
        // nothing. Reaching it needs edit mode to have survived a navigation *and* the field to
        // be cleared inside the hydration window; the cost of getting the alternative wrong is
        // larger than the bug.
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

  return { text: stored ? (stored.isDeleted ? '' : stored.value) : (fallback ?? ''), setValue };
}
