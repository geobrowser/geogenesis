import type * as React from 'react';

export const ENTITY_PAGE_COVER_MAX_WIDTH = 1192;
/** A personal space profile's cover: 1200 × 300, a 4:1 banner. */
export const PROFILE_COVER_SIZE = { maxWidth: 1200, height: 300 };
export const ENTITY_PAGE_CONTENT_MAX_WIDTH = 900;
export const ENTITY_PAGE_WITH_SIDEBAR_MAX_WIDTH = 1142;

export type EntityPageContentVariant = 'content' | 'with-sidebar' | 'auto-sidebar';

/**
 * Marks the element holding a page's content column, for anything that has to line up with it from
 * outside the page's own tree.
 *
 * The sticky entity header is the caller. It is portalled into the app shell, so no amount of CSS
 * reaches it from here — and there is no single width to hand it either: the generic page is 900 and
 * unpadded, a claim 840 at `px-4`/`px-5`, a topic 720 at the same, and a page with a rail 1142. It
 * measures whichever of these the title it is tracking sits inside, so a view with a width of its
 * own is matched by saying so here rather than by teaching the header about it.
 */
export const ENTITY_PAGE_CONTENT_ATTRIBUTE = 'data-entity-page-content';

/**
 * The widths above, as custom properties.
 *
 * Declared by whichever element uses them rather than globally, so they have to
 * travel with the rule. The avatar header needs the same responsive pair as the
 * content container — it aligns to that column — and it sits outside the
 * container in the tree, where the container's own declaration is out of scope.
 */
export const ENTITY_PAGE_WIDTH_VARIABLES = {
  '--entity-page-content-max-width': `${ENTITY_PAGE_CONTENT_MAX_WIDTH}px`,
  '--entity-page-with-sidebar-max-width': `${ENTITY_PAGE_WITH_SIDEBAR_MAX_WIDTH}px`,
} as React.CSSProperties;
