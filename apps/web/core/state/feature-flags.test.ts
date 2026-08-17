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

  it('defaults local feature flags to disabled', () => {
    expect(defaultFeatureFlags.debugDebatesPage).toBe(false);
    expect(defaultFeatureFlags.debateDebugging).toBe(false);
    expect(defaultFeatureFlags.debateFormatSelector).toBe(false);
    expect(defaultFeatureFlags.bountiesTab).toBe(false);
    expect(normalizeFeatureFlags(null)).toEqual({
      debugDebatesPage: false,
      debateDebugging: false,
      debateFormatSelector: false,
      bountiesTab: false,
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
      bountiesTab: false,
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
    expect(window.localStorage.getItem(featureFlagsStorageKey)).toBe(
      JSON.stringify({
        debugDebatesPage: true,
        debateDebugging: true,
        debateFormatSelector: true,
        bountiesTab: false,
      })
    );
  });
});
