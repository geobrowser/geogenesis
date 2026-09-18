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
  // Strictly above statusBar: <StatusBar /> renders after <Toast /> in
  // entry.tsx, so an equal z-index would stack the status bar over toasts.
  toast: 10002,

  // The availability calendar, which on a phone is the whole screen. Above the
  // status bar and the chat launcher, whose corners would otherwise sit on top
  // of its footer and take the taps meant for Clear all and Save.
  scheduleDialogBackdrop: 10003,
  scheduleDialog: 10004,
} as const;

export const Z_LAYER_CLASS = {
  flowBar: 'z-1000',
  slideUp: 'z-slide-up',
  statusBar: 'z-10001',
  toast: 'z-toast',
  scheduleDialogBackdrop: 'z-[10003]',
  scheduleDialog: 'z-[10004]',
} as const;
