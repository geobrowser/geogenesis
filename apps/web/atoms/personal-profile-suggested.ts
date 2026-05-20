import { ContentIds } from '@geoprotocol/geo-sdk/lite';
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

/**
 * Prefix for session dismiss flags (per-wallet suffix). Cleared when the wallet disconnects
 * so the card can return after the next login (“second wave” + Dismiss forever).
 */
export const PERSONAL_PROFILE_SESSION_DISMISS_STORAGE_KEY = 'geoPersonalProfileSuggestedSessionDismiss';

/** Removes all per-wallet session-dismiss flags (including prefixed keys). */
export function clearPersonalProfileSessionDismissStorage() {
  if (typeof window === 'undefined') return;
  for (let i = sessionStorage.length - 1; i >= 0; i--) {
    const k = sessionStorage.key(i);
    if (k?.startsWith(PERSONAL_PROFILE_SESSION_DISMISS_STORAGE_KEY)) {
      sessionStorage.removeItem(k);
    }
  }
}

export type PersonalProfileSuggestedTasks = {
  bio: boolean;
  work: boolean;
  education: boolean;
  skills: boolean;
  post: boolean;
};

export const personalProfileSuggestedTasksAtom = atomWithStorage<PersonalProfileSuggestedTasks>(
  'personalProfileSuggestedTasksV1',
  { bio: false, work: false, education: false, skills: false, post: false }
);

export type PersonalProfileSuggestedDismiss = {
  forever: boolean;
  softDismissCount: number;
};

export const personalProfileSuggestedDismissAtom = atomWithStorage<PersonalProfileSuggestedDismiss>(
  'personalProfileSuggestedDismissV3',
  { forever: false, softDismissCount: 0 }
);

export type PersonalProfileSkillsRowIntent = {
  entityId: string;
  spaceId: string;
  focusFindCreateInput: boolean;
  pendingEnableEdit: boolean;
};

export const personalProfileSkillsRowIntentAtom = atom<PersonalProfileSkillsRowIntent | null>(null);

export function propertyIsSkillsProperty(propertyId: string): boolean {
  return propertyId === ContentIds.SKILLS_PROPERTY;
}

export const personalProfileBioStarterTriggerAtom = atom(0);

export type PendingCreatePostSidePanel = {
  postEntityId: string;
  spaceId: string;
  profileEntityId: string;
  postsTabEntityId: string;
  profilePathname: string;
};

export const pendingCreatePostSidePanelAtom = atom<PendingCreatePostSidePanel | null>(null);
