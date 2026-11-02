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

/**
 * A sign-in from the debate hours page (GEO-3517) asks only for a name: the spaces and feed-topics
 * steps are skipped, so a newcomer RSVPing to a debate hour is back on the page one step later.
 * Set at the press by `usePrepareOnboarding`, which every sign-in runs, so any other sign-in clears
 * it. Persisted like the step, because a Google sign-in can come back on a fresh document.
 */
export const onboardingNameOnlyAtom = atomWithStorage<boolean>('onboardingNameOnly', false);

// 'enter-profile' and 'create-space' linger in the type only to normalize
// values persisted by an older version of the flow — see effectiveStep.
export const stepAtom = atomWithStorage<OnboardingStep>('onboardingStep', 'start');
