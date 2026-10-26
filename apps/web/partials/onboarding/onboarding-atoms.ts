import { atomWithStorage } from 'jotai/utils';

import type { OnboardingStep } from './onboarding-dialog-visibility';

// Kept apart from `dialog.tsx` so the code that only needs these atoms (logout cleanup, the profile
// editor, the browse sidebar) does not pull the whole onboarding dialog into the startup bundle.

export const nameAtom = atomWithStorage<string>('onboardingName', '');
export const topicIdAtom = atomWithStorage<string>('onboardingEntityId', '');
export const avatarAtom = atomWithStorage<string>('onboardingAvatar', '');
export const spaceIdAtom = atomWithStorage<string>('onboardingSpaceId', '');

/**
 * Topic picks from the 'interested-in' step. Onboarding no longer blocks on space
 * creation, so these are persisted for the background PendingPersonalSpaceRunner,
 * which applies them (membership proposals) once a real spaceId exists, then clears them.
 */
export const selectedTopicIdsAtom = atomWithStorage<string[]>('onboardingSelectedTopics', []);

// 'enter-profile' and 'create-space' linger in the type only to normalize
// values persisted by an older version of the flow — see effectiveStep.
export const stepAtom = atomWithStorage<OnboardingStep>('onboardingStep', 'start');
