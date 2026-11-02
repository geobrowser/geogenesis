import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_FRESH_SLOT_CONFIG } from './fresh-slot-config';
import {
  type FreshSlotHistoryEntry,
  type FreshSlotState,
  type FreshSlotStore,
  readFreshSlotHistory,
  readFreshSlotState,
  readServingFreshSlotState,
  resetFreshSlotServingCacheForTests,
  rollbackFreshSlotConfig,
  saveFreshSlotConfig,
} from './fresh-slot-store';

/** In memory, with the same compare-and-set rule as the Upstash script, storing JSON strings. */
function memoryStore() {
  const data = { state: null as string | null, revision: 0, history: [] as string[] };
  const store: FreshSlotStore = {
    readState: async () => data.state,
    readHistory: async limit => data.history.slice(0, limit),
    compareAndSet: async (expected, state: FreshSlotState, entry: FreshSlotHistoryEntry) => {
      if (data.revision !== expected) return false;
      data.state = JSON.stringify(state);
      data.revision = state.revision;
      data.history.unshift(JSON.stringify(entry));
      return true;
    },
  };
  return { store, data };
}

const on = { ...DEFAULT_FRESH_SLOT_CONFIG, enabled: true };
const ADMIN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

beforeEach(() => resetFreshSlotServingCacheForTests());

describe('saving', () => {
  it('starts disabled at revision 0', async () => {
    const { store } = memoryStore();
    expect(await readFreshSlotState(store)).toMatchObject({ revision: 0, config: { enabled: false } });
  });

  it('saves a new revision with a history entry of who, when, before and after', async () => {
    const { store } = memoryStore();
    const now = new Date('2026-10-07T12:00:00Z');
    const result = await saveFreshSlotConfig(store, { input: on, baseRevision: 0, by: ADMIN, now });
    expect(result).toMatchObject({ ok: true, state: { revision: 1, updatedBy: ADMIN, config: on } });

    const [entry] = await readFreshSlotHistory(store);
    expect(entry).toEqual({
      revision: 1,
      at: now.toISOString(),
      by: ADMIN,
      action: 'save',
      before: DEFAULT_FRESH_SLOT_CONFIG,
      after: on,
    });
  });

  it('clamps before saving and reports it', async () => {
    const { store } = memoryStore();
    const result = await saveFreshSlotConfig(store, { input: { ...on, maxPerPage: 40 }, baseRevision: 0, by: ADMIN });
    expect(result.ok && result.state.config.maxPerPage).toBe(6);
    expect(result.ok && result.adjustments).toEqual(['maxPerPage 40 -> 6']);
  });

  it('rejects an invalid config without writing', async () => {
    const { store, data } = memoryStore();
    const result = await saveFreshSlotConfig(store, { input: { enabled: 'yes' }, baseRevision: 0, by: ADMIN });
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(data.history).toHaveLength(0);
  });

  it('refuses a save based on a stale revision', async () => {
    const { store } = memoryStore();
    await saveFreshSlotConfig(store, { input: on, baseRevision: 0, by: ADMIN });
    const stale = await saveFreshSlotConfig(store, { input: on, baseRevision: 0, by: OTHER });
    expect(stale).toMatchObject({ ok: false, status: 409 });
  });
});

describe('rolling back', () => {
  it('restores any earlier entry as a new revision, recorded as a rollback', async () => {
    const { store } = memoryStore();
    await saveFreshSlotConfig(store, { input: on, baseRevision: 0, by: ADMIN });
    await saveFreshSlotConfig(store, { input: { ...on, cadence: 6 }, baseRevision: 1, by: OTHER });

    const result = await rollbackFreshSlotConfig(store, { toRevision: 1, baseRevision: 2, by: ADMIN });
    expect(result).toMatchObject({ ok: true, state: { revision: 3, config: on } });
    const [entry] = await readFreshSlotHistory(store);
    expect(entry).toMatchObject({ revision: 3, action: 'rollback', restoredRevision: 1, by: ADMIN });
    expect(entry?.before.cadence).toBe(6);
    expect(entry?.after.cadence).toBe(on.cadence);
  });

  it('can restore the defaults recorded before the first save', async () => {
    const { store } = memoryStore();
    await saveFreshSlotConfig(store, { input: on, baseRevision: 0, by: ADMIN });
    await saveFreshSlotConfig(store, { input: { ...on, cadence: 6 }, baseRevision: 1, by: ADMIN });
    // Revision 1's `before` is the default; restoring revision 1 gives its `after`.
    const result = await rollbackFreshSlotConfig(store, { toRevision: 1, baseRevision: 2, by: ADMIN });
    expect(result.ok && result.state.config).toEqual(on);
  });

  it('404s an unknown revision', async () => {
    const { store } = memoryStore();
    expect(await rollbackFreshSlotConfig(store, { toRevision: 7, baseRevision: 0, by: ADMIN })).toMatchObject({
      ok: false,
      status: 404,
    });
  });
});

describe('serving', () => {
  it('is disabled without a store', async () => {
    expect((await readServingFreshSlotState(null)).config.enabled).toBe(false);
  });

  it('is disabled when the store fails', async () => {
    const failing: FreshSlotStore = {
      readState: async () => {
        throw new Error('down');
      },
      readHistory: async () => [],
      compareAndSet: async () => false,
    };
    expect((await readServingFreshSlotState(failing)).config.enabled).toBe(false);
  });

  it('serves what was saved, and a save on this instance is served at once', async () => {
    const { store } = memoryStore();
    expect((await readServingFreshSlotState(store)).config.enabled).toBe(false);
    await saveFreshSlotConfig(store, { input: on, baseRevision: 0, by: ADMIN });
    expect((await readServingFreshSlotState(store)).config.enabled).toBe(true);
  });
});
