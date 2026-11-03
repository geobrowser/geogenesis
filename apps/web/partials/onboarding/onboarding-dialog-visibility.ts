export type OnboardingStep =
  | 'start'
  | 'existing-entity-match'
  | 'interested-in'
  | 'customize-feed'
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
 * Whether the dialog should be mounted. Wider than `shouldOpenOnboardingDialog`: at a persisted
 * `done` the dialog must still mount when onboarding is needed again, because the dialog itself
 * resets `done` to `start`. Without this, a browser that once finished onboarding never reopens it
 * for an account whose profile never landed.
 */
export function shouldMountOnboardingDialog(isOnboardingVisible: boolean, step: OnboardingStep): boolean {
  return isOnboardingVisible || shouldOpenOnboardingDialog(isOnboardingVisible, step);
}
