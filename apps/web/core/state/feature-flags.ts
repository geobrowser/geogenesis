'use client';

import { useAtom, useAtomValue } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export const featureFlagsStorageKey = 'geo:feature-flags';

export const featureFlagDefinitions = [
  {
    id: 'debateDebugging',
    label: 'Debate debugging',
    description: 'Show debate recording debug controls and the paused live-updates banner.',
  },
  {
    id: 'debateFormatSelector',
    label: 'Debate format selector',
    description: 'Allow the first matched debater to choose a format before accepting.',
  },
  {
    id: 'debugDebatesPage',
    label: 'Debates debug tab per space',
    description: 'Enable per-space debate processing diagnostics.',
  },
] as const;

export type FeatureFlagId = (typeof featureFlagDefinitions)[number]['id'];
export type FeatureFlags = Record<FeatureFlagId, boolean>;
// Claims and debates shipped to everyone, so `questionsTab` (and `debatesTab`, the id it was
// renamed from) are no longer flags. Both are still sitting in browsers' stored flag objects;
// normalizing drops them on the next write rather than reading them back.
type StoredFeatureFlags = Partial<Record<FeatureFlagId | 'questionsTab' | 'debatesTab', boolean>>;

export const defaultFeatureFlags: FeatureFlags = {
  debugDebatesPage: false,
  debateDebugging: false,
  debateFormatSelector: false,
};

export function normalizeFeatureFlags(flags: StoredFeatureFlags | null | undefined): FeatureFlags {
  return {
    debugDebatesPage: flags?.debugDebatesPage ?? defaultFeatureFlags.debugDebatesPage,
    debateDebugging: flags?.debateDebugging ?? defaultFeatureFlags.debateDebugging,
    debateFormatSelector: flags?.debateFormatSelector ?? defaultFeatureFlags.debateFormatSelector,
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
