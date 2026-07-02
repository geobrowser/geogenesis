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

  it('defaults the Questions tab flag to disabled', () => {
    expect(defaultFeatureFlags.questionsTab).toBe(false);
    expect(defaultFeatureFlags.debatesTab).toBe(false);
    expect(normalizeFeatureFlags(null)).toEqual({ questionsTab: false, debatesTab: false });
  });

  it('persists toggled feature flag values', () => {
    const store = createStore();

    store.set(featureFlagsAtom, currentFlags =>
      setFeatureFlagValue(normalizeFeatureFlags(currentFlags), 'questionsTab', true)
    );

    expect(store.get(featureFlagsAtom).questionsTab).toBe(true);
    expect(window.localStorage.getItem(featureFlagsStorageKey)).toBe(
      JSON.stringify({ questionsTab: true, debatesTab: false })
    );
  });
});
