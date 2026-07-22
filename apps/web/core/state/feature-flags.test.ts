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
    expect(defaultFeatureFlags.questionsTab).toBe(false);
    expect(defaultFeatureFlags.debateDebugging).toBe(false);
    expect(defaultFeatureFlags.debateFormatSelector).toBe(false);
    expect(normalizeFeatureFlags(null)).toEqual({
      questionsTab: false,
      debateDebugging: false,
      debateFormatSelector: false,
    });
  });

  it('maps the legacy Debates flag into the combined flag', () => {
    expect(normalizeFeatureFlags({ debatesTab: true })).toEqual({
      questionsTab: true,
      debateDebugging: false,
      debateFormatSelector: false,
    });
    expect(normalizeFeatureFlags({ questionsTab: true, debatesTab: false })).toEqual({
      questionsTab: true,
      debateDebugging: false,
      debateFormatSelector: false,
    });
  });

  it('persists toggled feature flag values', () => {
    const store = createStore();

    store.set(featureFlagsAtom, currentFlags => {
      const flags = setFeatureFlagValue(normalizeFeatureFlags(currentFlags), 'questionsTab', true);
      const debuggingFlags = setFeatureFlagValue(flags, 'debateDebugging', true);
      return setFeatureFlagValue(debuggingFlags, 'debateFormatSelector', true);
    });

    expect(store.get(featureFlagsAtom).questionsTab).toBe(true);
    expect(store.get(featureFlagsAtom).debateDebugging).toBe(true);
    expect(store.get(featureFlagsAtom).debateFormatSelector).toBe(true);
    expect(window.localStorage.getItem(featureFlagsStorageKey)).toBe(
      JSON.stringify({ questionsTab: true, debateDebugging: true, debateFormatSelector: true })
    );
  });
});
