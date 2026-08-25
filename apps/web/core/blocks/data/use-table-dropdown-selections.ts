'use client';

import * as React from 'react';

import {
  DropdownSelections,
  dropdownSelectionsStorageKey,
  parseStoredDropdownSelections,
} from './table-dropdown-selections';

/**
 * Personal dropdown selections for one data block, persisted in localStorage
 * (the Explore type-filter pattern). Selections are a per-user view: they
 * never touch the block's stored filters and never affect other users.
 *
 * `hydrated` stays false until storage has been read so callers can keep
 * querying with the block's own filters instead of briefly querying with
 * missing overrides. Writes only happen after a real user change — a
 * hydration read never clobbers storage.
 */
export function useTableDropdownSelections(blocksRelationEntityId: string) {
  const [selections, setSelections] = React.useState<DropdownSelections>({});
  const [hydrated, setHydrated] = React.useState(false);
  const userChangedRef = React.useRef(false);

  const storageKey = blocksRelationEntityId ? dropdownSelectionsStorageKey(blocksRelationEntityId) : null;

  React.useEffect(() => {
    if (!storageKey) return;
    userChangedRef.current = false;
    setSelections(parseStoredDropdownSelections(window.localStorage.getItem(storageKey)));
    setHydrated(true);
  }, [storageKey]);

  React.useEffect(() => {
    if (!storageKey || !userChangedRef.current) return;
    if (Object.keys(selections).length === 0) {
      window.localStorage.removeItem(storageKey);
    } else {
      window.localStorage.setItem(storageKey, JSON.stringify(selections));
    }
  }, [selections, storageKey]);

  const updateSelections = React.useCallback((updater: (current: DropdownSelections) => DropdownSelections) => {
    userChangedRef.current = true;
    setSelections(updater);
  }, []);

  return { selections, updateSelections, hydrated };
}
