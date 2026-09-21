'use client';

import { useAtom, useAtomValue } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

import { useHydrated } from '~/core/hooks/use-hydrated';

export const featureFlagsStorageKey = 'geo:feature-flags';

export const featureFlagDefinitions = [
  {
    id: 'debateDebugging',
    label: 'Debate debugging',
    description: 'Show debate recording debug controls and the paused live-updates banner.',
    enabledByDefault: false,
  },
  {
    id: 'debateFormatSelector',
    label: 'Debate format selector',
    description: 'Allow the first matched debater to choose a format before accepting.',
    enabledByDefault: false,
  },
  {
    id: 'playbackDiagnostics',
    label: 'Playback diagnostics',
    description:
      'Pin a readout to the bottom of the screen showing, for every debate video on screen, whether play() was called and what happened to it. For autoplay faults that only happen on a real phone (GEO-2978).',
    enabledByDefault: false,
  },
  {
    id: 'debugDebatesPage',
    label: 'Debates debug tab per space',
    description: 'Enable per-space debate processing diagnostics.',
    enabledByDefault: false,
  },
  {
    id: 'peerAvailability',
    label: "View someone's availability",
    description:
      'Show "See times" on People rows, opening another debater\'s week (GEO-2938). Shows times you both have free until the API can return their availability unfiltered.',
    enabledByDefault: false,
  },
  {
    id: 'exploreSidePanel',
    label: 'Explore side panel',
    description:
      'Bring back the right side panel on Explore — featured spaces and rankings, community calls, and the onboarding checklist. Off by default (GEO-2914).',
    // GEO-2914 hid the panel rather than deleting it, so this is off for everyone and the surface
    // it gates is still built, still fetched for, and one checkbox away from coming back.
    enabledByDefault: false,
  },
  {
    id: 'bountiesTab',
    label: 'Bounties',
    description: 'Bounty board, space bounty tabs, and bounty detail surfaces. On by default; testnet only.',
    enabledByDefault: true,
  },
] as const;

export type FeatureFlagId = (typeof featureFlagDefinitions)[number]['id'];
export type FeatureFlags = Record<FeatureFlagId, boolean>;
// Claims and debates shipped to everyone, so `questionsTab` (and `debatesTab`, the id it was
// renamed from) are no longer flags. Both are still sitting in browsers' stored flag objects;
// normalizing drops them on the next write rather than reading them back.
type StoredFeatureFlags = Partial<Record<FeatureFlagId | 'questionsTab' | 'debatesTab', boolean>>;

/**
 * Both of these are derived from the definitions above rather than written out beside them.
 *
 * A flag used to be spelled three times in this file and five more across two test files, and the
 * copy that mattered most was the easiest to miss: `normalizeFeatureFlags` is what reads a flag
 * back out of storage, so an id absent from it is a flag that silently never persists. Adding one
 * is a single entry above now, and there is no second list to fall out of step with it.
 *
 * Deriving also keeps the retirement behaviour that has its own test: only ids the definitions
 * name are emitted, so `questionsTab` and `debatesTab` — still sitting in browsers that opened the
 * dialog before claims and debates shipped to everyone — are dropped on the next write.
 */
export const defaultFeatureFlags: FeatureFlags = Object.fromEntries(
  featureFlagDefinitions.map(definition => [definition.id, definition.enabledByDefault])
) as FeatureFlags;

export function normalizeFeatureFlags(flags: StoredFeatureFlags | null | undefined): FeatureFlags {
  return Object.fromEntries(
    featureFlagDefinitions.map(definition => [definition.id, flags?.[definition.id] ?? definition.enabledByDefault])
  ) as FeatureFlags;
}

export function setFeatureFlagValue(flags: FeatureFlags, id: FeatureFlagId, enabled: boolean): FeatureFlags {
  return {
    ...flags,
    [id]: enabled,
  };
}

export const featureFlagsAtom = atomWithStorage<FeatureFlags>(featureFlagsStorageKey, defaultFeatureFlags, undefined, {
  getOnInit: true,
});

/**
 * The default until the browser has hydrated, then whatever is stored.
 *
 * The atom is `getOnInit: true`, so on the client it reads `localStorage` during initialization —
 * before React's first render. The server has no `localStorage` and always renders the default. A
 * reader who has ever toggled a flag therefore gets a server tree and a first client tree that
 * disagree, and React resolves that by discarding the server HTML for the subtree: a hydration
 * mismatch, thrown by the one reader for whom the flag was doing something.
 *
 * Gated here rather than at each call site. None of the four consumers guarded, the gate is easy
 * to forget precisely because the default state looks fine, and the cost of forgetting lands on
 * whoever turned the flag on. `useHydrated` is what the rest of the app uses for this — see
 * `use-access-control` and `use-user-is-editing`.
 *
 * The visible consequence is a flag's surface appearing one frame after mount rather than in the
 * server HTML. For a per-browser developer toggle that is the right trade; the alternative is a
 * mismatch.
 */
export function useFeatureFlag(id: FeatureFlagId) {
  const flags = useAtomValue(featureFlagsAtom);
  const hydrated = useHydrated();
  return hydrated ? normalizeFeatureFlags(flags)[id] : defaultFeatureFlags[id];
}

/**
 * A flag read that does not wait for hydration — for instrumentation, not for rendering.
 *
 * {@link useFeatureFlag} deliberately reports the default until `useHydrated` flips, which costs a
 * flag's surface one frame. That is the right trade for anything drawn on screen and the wrong one
 * for anything that has to be *installed* before the work it observes: a probe that arrives a frame
 * late reports nothing for the calls it missed, and "nothing" is indistinguishable from a real
 * negative. An instrument that can silently under-report is worse than no instrument, because it
 * answers confidently.
 *
 * Call this from an effect or an event handler only, never from render — that is exactly the
 * mismatch `useFeatureFlag` exists to prevent. Reads the same key the atom persists to.
 */
export function readStoredFeatureFlag(id: FeatureFlagId): boolean {
  if (typeof window === 'undefined') return defaultFeatureFlags[id];

  try {
    const stored = window.localStorage.getItem(featureFlagsStorageKey);
    return normalizeFeatureFlags(stored ? (JSON.parse(stored) as StoredFeatureFlags) : null)[id];
  } catch {
    // A browser with storage disabled, or a value some other tab left unparseable. Neither is a
    // reason to throw out of an effect.
    return defaultFeatureFlags[id];
  }
}

export function useDebugDebatesPageEnabled() {
  return useFeatureFlag('debugDebatesPage');
}

export function usePlaybackDiagnosticsEnabled() {
  return useFeatureFlag('playbackDiagnostics');
}

export function usePeerAvailabilityEnabled() {
  return useFeatureFlag('peerAvailability');
}

/**
 * Read *and* write, for the flags dialog. Deliberately not hydration-gated like
 * {@link useFeatureFlag}: the dialog's contents are inside a Radix `Root` that is closed until a
 * keyboard shortcut or the hidden route opens it, both of which happen after mount — so there is no
 * server render of these values to disagree with, and gating the read would only delay the
 * checkboxes catching up to what they are about to write.
 */
export function useFeatureFlags() {
  const [flags, setFlags] = useAtom(featureFlagsAtom);
  const normalizedFlags = normalizeFeatureFlags(flags);

  const setFeatureFlag = (id: FeatureFlagId, enabled: boolean) => {
    setFlags(currentFlags => setFeatureFlagValue(normalizeFeatureFlags(currentFlags), id, enabled));
  };

  return {
    flags: normalizedFlags,
    setFeatureFlag,
  };
}
