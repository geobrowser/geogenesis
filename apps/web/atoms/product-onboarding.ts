import { atomWithStorage } from 'jotai/utils';

export const PRODUCT_ONBOARDING_HINT_IDS = {
  editModeToggle: 'geoEditModeToggleTipDismissedV1',
  reviewEdits: 'geoReviewEditsTipDismissedV1',
  proposalName: 'geoProposalNameTipDismissedV1',
} as const;

/** Persisted list of product onboarding hint ids dismissed by the user. */
export const dismissedProductOnboardingHintsAtom = atomWithStorage<Array<string>>(
  'dismissedProductOnboardingHints',
  []
);
