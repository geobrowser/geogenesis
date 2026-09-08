'use client';

import * as React from 'react';

import {
  DropdownSelections,
  dropdownSelectionsStorageKey,
  parseStoredDropdownSelections,
} from './table-dropdown-selections';

/**
 * Personal dropdown selections, shared across every hook instance for the
 * same block: `useDataBlock` runs once per consumer (table, block title,
 * view menu, row actions), and per-instance state would leave siblings
 * querying with a stale overlay and fighting over pagination anchors. One
 * external store per storage key keeps every instance on the same view.
 *
 * Persisted in localStorage, hydrated LAZILY AND SYNCHRONOUSLY on the first
 * client read (inside the snapshot getter) rather than in an effect: an
 * effect-based hydration made the block's first query run with the base
 * (unoverlaid) where and immediately re-key — one wasted, uncancellable
 * full query per visit for anyone with stored selections. The server
 * snapshot stays empty; useSyncExternalStore's server/client divergence
 * handling re-renders after hydration without mismatch warnings. Writes
 * happen only after a real user change — never on hydration.
 */
type SelectionsEntry = {
  selections: DropdownSelections;
  hydrated: boolean;
  listeners: Set<() => void>;
};

const entries = new Map<string, SelectionsEntry>();

function getEntry(storageKey: string): SelectionsEntry {
  let entry = entries.get(storageKey);
  if (!entry) {
    entry = { selections: {}, hydrated: false, listeners: new Set() };
    entries.set(storageKey, entry);
  }
  return entry;
}

/**
 * The entry with storage read exactly once, on first CLIENT access. Safe to
 * call from a snapshot getter: the one-time mutation happens before the
 * first snapshot is consumed, and every later call returns the same
 * references.
 */
function getHydratedEntry(storageKey: string): SelectionsEntry {
  const entry = getEntry(storageKey);
  if (!entry.hydrated && typeof window !== 'undefined') {
    try {
      entry.selections = parseStoredDropdownSelections(window.localStorage.getItem(storageKey));
    } catch {
      entry.selections = {};
    }
    entry.hydrated = true;
  }
  return entry;
}

function update(storageKey: string, updater: (current: DropdownSelections) => DropdownSelections) {
  const entry = getHydratedEntry(storageKey);
  entry.selections = updater(entry.selections);
  try {
    if (Object.keys(entry.selections).length === 0) {
      window.localStorage.removeItem(storageKey);
    } else {
      window.localStorage.setItem(storageKey, JSON.stringify(entry.selections));
    }
  } catch {
    // Storage can be unavailable (private windows); the in-memory view still works.
  }
  entry.listeners.forEach(listener => listener());
}

/** Test-only: drop all shared state so specs are isolated. */
export function __resetDropdownSelectionsStoreForTests() {
  entries.clear();
}

export function useTableDropdownSelections(blocksRelationEntityId: string) {
  const storageKey = blocksRelationEntityId ? dropdownSelectionsStorageKey(blocksRelationEntityId) : null;

  const subscribe = React.useCallback(
    (listener: () => void) => {
      if (!storageKey) return () => {};
      const entry = getEntry(storageKey);
      entry.listeners.add(listener);
      return () => entry.listeners.delete(listener);
    },
    [storageKey]
  );

  const selections = React.useSyncExternalStore(
    subscribe,
    () => (storageKey ? getHydratedEntry(storageKey).selections : EMPTY_SELECTIONS),
    () => EMPTY_SELECTIONS
  );
  const hydrated = React.useSyncExternalStore(
    subscribe,
    () => (storageKey ? getHydratedEntry(storageKey).hydrated : false),
    () => false
  );

  const updateSelections = React.useCallback(
    (updater: (current: DropdownSelections) => DropdownSelections) => {
      if (storageKey) update(storageKey, updater);
    },
    [storageKey]
  );

  return { selections, updateSelections, hydrated };
}

const EMPTY_SELECTIONS: DropdownSelections = {};
