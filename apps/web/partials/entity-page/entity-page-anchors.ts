/**
 * The two marks an entity page leaves in the DOM for the sticky header to find it by.
 *
 * Its own module, with no `'use client'`, because the `(entity)` layout is a Server Component: every
 * export of a client module is a client reference on the server, so a constant living beside a
 * component would reach the flight payload as a reference rather than a string. `space-tabs-anchor`
 * is here for the same reason and is the pattern this follows.
 *
 * Attribute and selector are one contract with two halves, and the point of naming each once is that
 * the two cannot drift — four files were spelling `data-entity-page-title` out by hand.
 *
 * Why the DOM at all: the header is mounted once in the layout and portalled into the app shell,
 * above every branch that draws a page, while the title and the column it has to find are drawn by
 * four unrelated components with only one of them mounted at a time. There is no ref to hand between
 * the two without threading a context through every branch.
 */

/** Marks an entity page's title, valued with the entity it names so a side panel cannot be mistaken for it. */
export const ENTITY_PAGE_TITLE_ATTRIBUTE = 'data-entity-page-title';

/** Marks the element holding a page's content column, for anything lining up with it from outside. */
export const ENTITY_PAGE_CONTENT_ATTRIBUTE = 'data-entity-page-content';

/** Spread onto whichever element draws the title. */
export function entityPageTitleAnchor(entityId: string | undefined) {
  return { [ENTITY_PAGE_TITLE_ATTRIBUTE]: entityId };
}

/**
 * Spread onto a page's content column.
 *
 * There is no single width to hand the header instead: the generic page is 900 and unpadded, a claim
 * 840 at `px-4`/`px-5`, a topic 720 at the same, and a page with a rail 1142. It measures whichever
 * of these carries this, so a view with a width of its own is matched by saying so rather than by
 * teaching the header about it.
 */
export const ENTITY_PAGE_CONTENT_ANCHOR = { [ENTITY_PAGE_CONTENT_ATTRIBUTE]: '' };

/** The selector matching one entity's title. */
export function entityPageTitleSelector(entityId: string) {
  return `[${ENTITY_PAGE_TITLE_ATTRIBUTE}="${escapeAttributeValue(entityId)}"]`;
}

/**
 * Entity ids are uuids, so this is belt and braces — but the value comes from a route param, and
 * `CSS.escape` is missing in jsdom, so the fallback has to be the identity rather than a throw.
 */
function escapeAttributeValue(value: string) {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(value) : value;
}
