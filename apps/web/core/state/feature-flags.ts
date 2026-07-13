'use client';

import { useAtom, useAtomValue } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export const featureFlagsStorageKey = 'geo:feature-flags';

export const featureFlagDefinitions = [
  {
    id: 'questionsTab',
    label: 'Claims and debates',
    description: 'Show the Claims and Debates tabs on spaces.',
  },
  {
    id: 'debateDebugging',
    label: 'Debate debugging',
    description: 'Show manual debugging controls during debate recording.',
  },
] as const;

export type FeatureFlagId = (typeof featureFlagDefinitions)[number]['id'];
export type FeatureFlags = Record<FeatureFlagId, boolean>;
type StoredFeatureFlags = Partial<Record<FeatureFlagId | 'debatesTab', boolean>>;

export const defaultFeatureFlags: FeatureFlags = {
  questionsTab: false,
  debateDebugging: false,
};

export function normalizeFeatureFlags(flags: StoredFeatureFlags | null | undefined): FeatureFlags {
  return {
    questionsTab: flags?.questionsTab ?? flags?.debatesTab ?? defaultFeatureFlags.questionsTab,
    debateDebugging: flags?.debateDebugging ?? defaultFeatureFlags.debateDebugging,
  };
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
