import type * as React from 'react';

export const ENTITY_PAGE_COVER_MAX_WIDTH = 1192;
export const ENTITY_PAGE_CONTENT_MAX_WIDTH = 900;
export const ENTITY_PAGE_WITH_SIDEBAR_MAX_WIDTH = 1142;

export type EntityPageContentVariant = 'content' | 'with-sidebar' | 'auto-sidebar';

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
