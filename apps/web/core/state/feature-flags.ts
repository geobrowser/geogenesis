'use client';

import { useAtom, useAtomValue } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export const featureFlagsStorageKey = 'geo:feature-flags';

export const featureFlagDefinitions = [
  {
    id: 'questionsTab',
    label: 'Questions tab',
    description: 'Show the Questions tab on spaces.',
  },
] as const;

export type FeatureFlagId = (typeof featureFlagDefinitions)[number]['id'];
export type FeatureFlags = Record<FeatureFlagId, boolean>;

export const defaultFeatureFlags: FeatureFlags = {
  questionsTab: false,
};

export function normalizeFeatureFlags(flags: Partial<Record<FeatureFlagId, boolean>> | null | undefined): FeatureFlags {
  return {
    ...defaultFeatureFlags,
    ...flags,
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
