/**
 * Global overlay z-index stack (low → high).
 */
export const Z_LAYERS = {
  assistantLauncherMobile: 79,

  flowBar: 1000,
  onboardingTipBackdrop: 1000,
  onboardingTip: 1001,

  assistantLauncher: 1100,

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

  // 10003 is the elevated popover, in styles.css — raised there rather than here because what needs
  // lifting is a wrapper radix owns. Both `body[data-entity-side-panel-open]` and
  // `body[data-slide-up-open]` claim it, so a popover opened from inside either sits above both.

  statusBar: 10004,
  // Strictly above statusBar: <StatusBar /> renders after <Toast /> in
  // entry.tsx, so an equal z-index would stack the status bar over toasts.
  toast: 10005,

  // The availability calendar, which on a phone is the whole screen. Above the status bar, the
  // toast and the chat launcher, whose corners would otherwise sit on top of its footer and take
  // the taps meant for Clear all and Save.
  //
  // Renumbered from 10003/10004: master moved statusBar to 10004 and toast to 10005 after this
  // was written, so the original pair would now sit *below* both -- the opposite of the point.
  scheduleDialogBackdrop: 10006,
  scheduleDialog: 10007,

  // A modal bottom sheet (the lobby's person and claim menus on a phone). Over everything else,
  // the assistant launcher and the debates panel included, since a modal takes every tap.
  bottomSheetBackdrop: 10008,
  bottomSheet: 10009,

  // The save-votes prompt when the navbar's "Save N votes" opens it centred (GEO-3400), backdrop and
  // card in one layer: the card sits inside its backdrop. Above the status bar, toasts and chat
  // launcher; level with the schedule dialog, which needs an account, so the two never meet. Below
  // the bottom sheet, which stays on top of everything.
  saveVotesDialog: 10007,
} as const;

export const Z_LAYER_CLASS = {
  // Match the side panels' mobile layout breakpoint (lg: is max-width: 1023px). Keep the
  // launcher below their backdrops, including the comments sheet at z-80, so it cannot take
  // taps through an open panel. Both the initial and loaded launcher use this class.
  assistantLauncher: 'z-1100 lg:z-[79]',
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
  scheduleDialogBackdrop: 'z-[10006]',
  scheduleDialog: 'z-[10007]',
  bottomSheetBackdrop: 'z-[10008]',
  bottomSheet: 'z-[10009]',
  saveVotesDialog: 'z-[10007]',
} as const;
