import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export const PRODUCT_ONBOARDING_HINT_IDS = {
  editModeToggle: 'geoEditModeToggleTipDismissedV1',
  reviewEdits: 'geoReviewEditsTipDismissedV1',
  proposalName: 'geoProposalNameTipDismissedV1',
} as const;

export const dismissedProductOnboardingHintsAtom = atomWithStorage<Array<string>>(
  'dismissedProductOnboardingHints',
  []
);

function dismissedHintAtom(hintId: string) {
  return atom(
    get => get(dismissedProductOnboardingHintsAtom).includes(hintId),
    (get, set, dismissed: boolean) => {
      const dismissedHints = get(dismissedProductOnboardingHintsAtom);
      if (dismissed) {
        if (!dismissedHints.includes(hintId)) {
          set(dismissedProductOnboardingHintsAtom, [...dismissedHints, hintId]);
        }
        return;
      }
      set(
        dismissedProductOnboardingHintsAtom,
        dismissedHints.filter(existingHintId => existingHintId !== hintId)
      );
    }
  );
}

/** Persisted after the user dismisses the edit/browse mode toggle tip on their personal space. */
export const editModeToggleTipDismissedAtom = dismissedHintAtom(PRODUCT_ONBOARDING_HINT_IDS.editModeToggle);

/** Persisted after the user dismisses the review-edits flow bar tip. */
export const reviewEditsTipDismissedAtom = dismissedHintAtom(PRODUCT_ONBOARDING_HINT_IDS.reviewEdits);

/** Persisted after the user dismisses the proposal name tip in the review panel. */
export const proposalNameTipDismissedAtom = dismissedHintAtom(PRODUCT_ONBOARDING_HINT_IDS.proposalName);
