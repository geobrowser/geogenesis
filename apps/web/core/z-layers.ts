/**
 * Global overlay z-index stack (low → high).
 */
export const Z_LAYERS = {
  flowBar: 1000,
  onboardingTipBackdrop: 1000,
  onboardingTip: 1001,

  slideUp: 10000,
  reviewOnboardingTipBackdrop: 10000,
  reviewOnboardingTip: 10000,

  statusBar: 10001,
} as const;

export const Z_LAYER_CLASS = {
  flowBar: 'z-1000',
  slideUp: 'z-slide-up',
  statusBar: 'z-10001',
} as const;
