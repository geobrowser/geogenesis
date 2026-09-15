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
  // Every layer below is strictly greater rather than equal, because DOM order cannot be reasoned
  // about here: both panels are portalled to `document.body` when they open, which appends them
  // after the app root that `entry.tsx` renders the status bar and toasts inside. At an equal
  // z-index the panel would therefore win — covering the status bar, and on mobile, where the panel
  // fills the viewport, covering a toast outright.
  commentsPanelOverSlideUp: 10001,
  entitySidePanelOverSlideUp: 10002,

  // 10003 is the elevated popover, in styles.css under `body[data-entity-side-panel-open]`.

  statusBar: 10004,
  // Strictly above statusBar: <StatusBar /> renders after <Toast /> in
  // entry.tsx, so an equal z-index would stack the status bar over toasts.
  toast: 10005,
} as const;

export const Z_LAYER_CLASS = {
  flowBar: 'z-1000',
  slideUp: 'z-slide-up',
  commentsPanelOverSlideUp: 'z-[10001]',
  /**
   * The same layer at the mobile breakpoint, which is a separate class because `md:` is max-width
   * here and a media-query rule beats the unprefixed one. Spelled out rather than built as
   * `md:${...}`, because Tailwind only emits classes it can find as literal text in the source.
   */
  commentsPanelOverSlideUpMobile: 'md:z-[10001]',
  entitySidePanelOverSlideUp: 'z-[10002]',
  statusBar: 'z-status-bar',
  toast: 'z-toast',
} as const;
