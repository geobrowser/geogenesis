export type OnboardingStep =
  | 'start'
  | 'enter-profile'
  | 'existing-entity-match'
  | 'create-space'
  | 'completed'
  | 'done';

/**
 * The completion screen intentionally stays mounted after optimistic setup hides
 * onboarding. Once the flow reaches `done`, however, it has no renderable body and
 * must stay closed even if registration state briefly re-arms onboarding visibility.
 */
export function shouldOpenOnboardingDialog(isOnboardingVisible: boolean, step: OnboardingStep): boolean {
  if (step === 'done') return false;
  return isOnboardingVisible || step === 'completed';
}
