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

  // Both panels can be opened from inside a slide-up — the comments panel from its header, the
  // entity side panel from a comment author's name — so both have to clear it. They keep their
  // usual order relative to each other: the side panel opens *on top of* the comments panel.
  //
  // Ties with `statusBar` and `toast` are deliberate and resolve by DOM order: `entry.tsx` renders
  // both of those after the panels, so a toast still lands over a panel, which is what it is for.
  commentsPanelOverSlideUp: 10001,
  entitySidePanelOverSlideUp: 10002,

  statusBar: 10001,
  // Strictly above statusBar: <StatusBar /> renders after <Toast /> in
  // entry.tsx, so an equal z-index would stack the status bar over toasts.
  toast: 10002,
} as const;

export const Z_LAYER_CLASS = {
  flowBar: 'z-1000',
  slideUp: 'z-slide-up',
  commentsPanelOverSlideUp: 'z-[10001]',
  entitySidePanelOverSlideUp: 'z-[10002]',
  statusBar: 'z-10001',
  toast: 'z-toast',
} as const;
