import { createStore } from 'jotai';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  defaultFeatureFlags,
  featureFlagsAtom,
  featureFlagsStorageKey,
  normalizeFeatureFlags,
  setFeatureFlagValue,
} from './feature-flags';

describe('feature flags', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults dev flags to disabled and the bounties surfaces to enabled', () => {
    expect(defaultFeatureFlags.debugDebatesPage).toBe(false);
    expect(defaultFeatureFlags.debateDebugging).toBe(false);
    expect(defaultFeatureFlags.debateFormatSelector).toBe(false);
    // GEO-2914 hid the Explore side panel behind this rather than deleting it, so off is the
    // shipped state rather than a developer convenience — see the explore-page test.
    expect(defaultFeatureFlags.exploreSidePanel).toBe(false);
    expect(defaultFeatureFlags.bountiesTab).toBe(true);
    expect(normalizeFeatureFlags(null)).toEqual({
      debugDebatesPage: false,
      debateDebugging: false,
      debateFormatSelector: false,
      exploreSidePanel: false,
      bountiesTab: true,
    });
  });

  // Claims and debates shipped to everyone. Every browser that ever opened the flags dialog still
  // has the retired ids in storage, and they must not survive normalization — a stray `questionsTab`
  // reaching the dialog would render a checkbox for a flag nothing reads.
  it('drops the retired claims-and-debates flags that are still in storage', () => {
    expect(normalizeFeatureFlags({ questionsTab: true, debatesTab: true, debateDebugging: true })).toEqual({
      debugDebatesPage: false,
      debateDebugging: true,
      debateFormatSelector: false,
      exploreSidePanel: false,
      bountiesTab: true,
    });
  });

  it('persists toggled feature flag values', () => {
    const store = createStore();

    store.set(featureFlagsAtom, currentFlags => {
      const debugPageFlags = setFeatureFlagValue(normalizeFeatureFlags(currentFlags), 'debugDebatesPage', true);
      const debuggingFlags = setFeatureFlagValue(debugPageFlags, 'debateDebugging', true);
      return setFeatureFlagValue(debuggingFlags, 'debateFormatSelector', true);
    });

    expect(store.get(featureFlagsAtom).debugDebatesPage).toBe(true);
    expect(store.get(featureFlagsAtom).debateDebugging).toBe(true);
    expect(store.get(featureFlagsAtom).debateFormatSelector).toBe(true);
    // Parsed, not string-compared: what is stored is the values, and the key order they happen to
    // serialize in is incidental — it follows the definition list, and pinning it here would fail
    // on a reordering that changes nothing a reader could notice.
    expect(JSON.parse(window.localStorage.getItem(featureFlagsStorageKey) ?? 'null')).toEqual({
      debugDebatesPage: true,
      debateDebugging: true,
      debateFormatSelector: true,
      exploreSidePanel: false,
      bountiesTab: true,
    });
  });
});
