import { atomWithStorage } from 'jotai/utils';

export const HINT_IDS = {
  editModeToggle: 'geoEditModeToggleTipDismissedV1',
  reviewEdits: 'geoReviewEditsTipDismissedV1',
  proposalName: 'geoProposalNameTipDismissedV1',
} as const;

/** Persisted list of product hint ids dismissed by the user. */
export const dismissedHintsAtom = atomWithStorage<Array<string>>('dismissedProductOnboardingHints', []);
