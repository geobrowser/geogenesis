/** The recording room's Calibre faces, shared by fixed formats and Open rounds. */
export const recordingFont = {
  fontFamily: 'var(--font-calibre), sans-serif',
  textRendering: 'optimizeLegibility',
} as const;

/** Keep the outline at the fixed-format room's 2px weight, regardless of the text size. */
export const recordingOverlayTextShadow = {
  textShadow: '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 3px 8px #000',
} as const;

/** Fixed-format labels use the inverse of the white-on-black count-in numbers. */
export const recordingLabelTextShadow = {
  textShadow: '-2px -2px 0 #fff, 2px -2px 0 #fff, -2px 2px 0 #fff, 2px 2px 0 #fff, 0 4px 12px rgba(0,0,0,0.25)',
} as const;
