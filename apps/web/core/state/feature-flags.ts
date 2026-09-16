'use client';

import { useAtom, useAtomValue } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

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
    id: 'debugDebatesPage',
    label: 'Debates debug tab per space',
    description: 'Enable per-space debate processing diagnostics.',
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

export function useFeatureFlag(id: FeatureFlagId) {
  const flags = useAtomValue(featureFlagsAtom);
  return normalizeFeatureFlags(flags)[id];
}

export function useDebugDebatesPageEnabled() {
  return useFeatureFlag('debugDebatesPage');
}

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
