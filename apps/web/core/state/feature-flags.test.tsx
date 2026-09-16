import { cleanup, render, waitFor } from '@testing-library/react';

import { createElement } from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  defaultFeatureFlags,
  featureFlagsAtom,
  featureFlagsStorageKey,
  normalizeFeatureFlags,
  setFeatureFlagValue,
  useFeatureFlag,
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

/**
 * The atom is `getOnInit: true`, so on the client it reads `localStorage` before React's first
 * render while the server has none and always renders the default. Without a gate, a reader who
 * has ever toggled a flag gets a server tree and a first client tree that disagree — a hydration
 * mismatch thrown by the one reader for whom the flag was doing something.
 */
describe('useFeatureFlag hydration', () => {
  afterEach(cleanup);

  /**
   * Renders with the atom *already holding* a non-default value, which is the browser condition
   * this gate exists for: `getOnInit: true` means the store reads `localStorage` before React's
   * first render, so the value is in hand by the time the tree is built. Seeding the store
   * reproduces that; writing to `localStorage` here does not, because the atom is created at module
   * import and has already read it by the time a test could set anything.
   */
  function renderProbeWithStoredFlag() {
    const seen: boolean[] = [];
    const store = createStore();
    store.set(featureFlagsAtom, { ...defaultFeatureFlags, exploreSidePanel: true });

    function Probe() {
      seen.push(useFeatureFlag('exploreSidePanel'));
      return null;
    }

    render(createElement(Provider, { store }, createElement(Probe)));
    return seen;
  }

  it('renders the default first, so the first client tree matches the server', () => {
    const seen = renderProbeWithStoredFlag();

    expect(seen[0]).toBe(false);
  });

  it('then catches up to what is stored, or the flag would do nothing', async () => {
    // The guard on the case above: returning the default forever would "fix" hydration by breaking
    // the feature.
    const seen = renderProbeWithStoredFlag();

    await waitFor(() => expect(seen.at(-1)).toBe(true));
  });
});
