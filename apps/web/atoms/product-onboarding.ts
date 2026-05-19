import { atomWithStorage } from 'jotai/utils';

/** Persisted after the user dismisses the edit/browse mode toggle tip on their personal space. */
export const editModeToggleTipDismissedAtom = atomWithStorage<boolean>(
  'geoEditModeToggleTipDismissedV1',
  false
);

/** Persisted after the user dismisses the review-edits flow bar tip. */
export const reviewEditsTipDismissedAtom = atomWithStorage<boolean>('geoReviewEditsTipDismissedV1', false);

/** Persisted after the user dismisses the proposal name tip in the review panel. */
export const proposalNameTipDismissedAtom = atomWithStorage<boolean>('geoProposalNameTipDismissedV1', false);
