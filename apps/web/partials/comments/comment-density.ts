/**
 * Comment row metrics, and the nested-thread connector geometry derived from them.
 *
 * Kept out of comments-section.tsx so the geometry can be unit-tested on its own —
 * that module pulls in jotai storage atoms and a sync-engine provider, which a test
 * of pure arithmetic has no business booting.
 */
const COMMENT_AVATAR_COL_PX = 32;
const COMMENT_HEADER_GAP_PX = 12;
const COMMENT_BODY_INSET_PX = COMMENT_AVATAR_COL_PX + COMMENT_HEADER_GAP_PX;
const COMMENT_AVATAR_COLUMN_CENTER_PX = COMMENT_AVATAR_COL_PX / 2;

/**
 * Row density. Entity pages use the roomy 32px-avatar layout; side panels (the
 * debates feed's Comments panel) use the design's compact 20px avatar, which
 * pulls the body up under the name instead of leaving it below a tall avatar
 * row. The body inset stays 44px in both so nested threading geometry holds.
 */
export type CommentDensity = {
  avatarPx: number;
  bodyInsetPx: number;
  avatarCenterPx: number;
  /** Author name. */
  nameClass: string;
  /** Timestamp, Reply/Edit actions — anything secondary in grey. */
  metaClass: string;
  /** Comment body copy and the composer prompt. */
  bodyClass: string;
};

export const PAGE_DENSITY: CommentDensity = {
  avatarPx: COMMENT_AVATAR_COL_PX,
  bodyInsetPx: COMMENT_BODY_INSET_PX,
  avatarCenterPx: COMMENT_AVATAR_COLUMN_CENTER_PX,
  nameClass: 'text-bodySemibold',
  metaClass: 'text-smallButton',
  bodyClass: 'text-body',
};

// Figma's comment type ramp (Geo "Comment name" / "Comment text" / "Comment
// button" tokens): everything is 16px — the page's 20px body and 11px footnote
// are much larger/smaller respectively, and the oversized body is what made the
// column wrap early and look narrow in the panel.
export const PANEL_DENSITY: CommentDensity = {
  avatarPx: 20,
  bodyInsetPx: COMMENT_BODY_INSET_PX,
  avatarCenterPx: 10,
  nameClass: 'text-[16px] leading-[13px] font-medium tracking-[-0.35px]',
  metaClass: 'text-[16px] leading-[13px] tracking-[-0.35px]',
  bodyClass: 'text-[16px] leading-[20px] tracking-[-0.35px]',
};

/**
 * Distance from a nested reply list's left edge back to its parent avatar's centre.
 *
 * The list sits inside the parent's body area, inset by `bodyInsetPx`, while the
 * parent's avatar centre is `avatarCenterPx` from that row's left edge — so the
 * connectors have to reach back by the difference. That is 28px at the page's 32px
 * avatar and 34px at the panel's 20px one; hardcoding 28 left every panel connector
 * 6px right of the avatar it was meant to meet.
 */
export function threadSpineOffsetPx(density: CommentDensity): number {
  return density.bodyInsetPx - density.avatarCenterPx;
}
