import { atom } from 'jotai';

export type OnboardingStep =
  | 'start'
  | 'existing-entity-match'
  | 'interested-in'
  | 'completed'
  | 'done'
  // Legacy values that may still be persisted in localStorage from an older
  // version of the flow. They are normalized to 'start' (see effectiveStep).
  | 'enter-profile'
  | 'create-space';

/**
 * The completion screen intentionally stays mounted after optimistic setup hides
 * onboarding. Once the flow reaches `done`, however, it has no renderable body and
 * must stay closed even if registration state briefly re-arms onboarding visibility.
 */
export function shouldOpenOnboardingDialog(isOnboardingVisible: boolean, step: OnboardingStep): boolean {
  if (step === 'done') return false;
  return isOnboardingVisible || step === 'completed';
}

/**
 * How many inline onboarding surfaces are holding onboarding for themselves right now.
 *
 * The full-screen debate player runs sign-up and onboarding inside its claim panel while the debate
 * plays (GEO-3112). While it does, the app-wide modal must stand down — the two would otherwise
 * both show the same steps. A count rather than a flag, so the panel can hand over from its email
 * step to its onboarding steps (one unmounting as the other mounts) without the modal getting a
 * frame in between.
 */
export const inlineOnboardingHoldsAtom = atom(0);
