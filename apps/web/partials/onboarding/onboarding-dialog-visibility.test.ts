import { describe, expect, it } from 'vitest';

import { shouldMountOnboardingDialog, shouldOpenOnboardingDialog } from './onboarding-dialog-visibility';

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
    expect(shouldOpenOnboardingDialog(true, 'customize-feed')).toBe(true);
    expect(shouldOpenOnboardingDialog(false, 'customize-feed')).toBe(false);
  });
});

describe('shouldMountOnboardingDialog', () => {
  it('mounts at a persisted done step when onboarding is needed again, so the dialog can reset it', () => {
    expect(shouldMountOnboardingDialog(true, 'done')).toBe(true);
  });

  it('stays unmounted at done while onboarding is not needed', () => {
    expect(shouldMountOnboardingDialog(false, 'done')).toBe(false);
  });

  it('mounts whenever the dialog would open', () => {
    expect(shouldMountOnboardingDialog(false, 'completed')).toBe(true);
    expect(shouldMountOnboardingDialog(true, 'start')).toBe(true);
    expect(shouldMountOnboardingDialog(false, 'start')).toBe(false);
  });
});
