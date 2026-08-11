import { describe, expect, it } from 'vitest';

import { shouldOpenOnboardingDialog } from './onboarding-dialog-visibility';

describe('shouldOpenOnboardingDialog', () => {
  it('keeps the optimistic completion screen open after onboarding visibility clears', () => {
    expect(shouldOpenOnboardingDialog(false, 'completed')).toBe(true);
  });

  it('keeps the terminal done state closed when onboarding visibility briefly re-arms', () => {
    expect(shouldOpenOnboardingDialog(true, 'done')).toBe(false);
  });

  it('follows onboarding visibility for interactive steps', () => {
    expect(shouldOpenOnboardingDialog(true, 'enter-profile')).toBe(true);
    expect(shouldOpenOnboardingDialog(false, 'enter-profile')).toBe(false);
  });
});
