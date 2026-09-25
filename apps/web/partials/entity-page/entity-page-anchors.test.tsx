import { afterEach, describe, expect, it } from 'vitest';

import {
  ENTITY_PAGE_CONTENT_ANCHOR,
  ENTITY_PAGE_CONTENT_ATTRIBUTE,
  ENTITY_PAGE_TITLE_ATTRIBUTE,
  entityPageTitleAnchor,
  entityPageTitleSelector,
} from './entity-page-anchors';

const ENTITY = 'a1b2c3d4e5f6427a8b9c0d1e2f3a4b5c';

/** The routed page: everything under `<Main>`, which is where a route's own title is drawn. */
function routeTitle(entityId = ENTITY) {
  const main = document.createElement('main');
  const title = document.createElement('h1');
  title.setAttribute(ENTITY_PAGE_TITLE_ATTRIBUTE, entityId);
  main.append(title);
  document.body.append(main);
  return title;
}

/**
 * The entity side panel, which portals to `document.body` in both of its branches — and draws its
 * title through the very same components the route does.
 */
function panelTitle(entityId = ENTITY) {
  const panel = document.createElement('aside');
  panel.setAttribute('data-entity-side-panel', '');
  const title = document.createElement('h1');
  title.setAttribute(ENTITY_PAGE_TITLE_ATTRIBUTE, entityId);
  panel.append(title);
  document.body.append(panel);
  return title;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('entityPageTitleSelector', () => {
  it('finds the route’s own title', () => {
    const title = routeTitle();

    expect(document.querySelector(entityPageTitleSelector(ENTITY))).toBe(title);
  });

  /**
   * The case document order alone does not cover. A Debate route draws the live feed instead of a
   * title, so with the panel open on that same entity its heading was the only match — and the
   * panel scrolls in a container of its own, so scrolling it raised the route's bar over a page
   * whose title had never moved.
   */
  it('ignores a side panel’s title when the route draws none', () => {
    panelTitle();
    document.body.prepend(document.createElement('main'));

    expect(document.querySelector(entityPageTitleSelector(ENTITY))).toBeNull();
  });

  it('prefers the route’s title over a panel open on the same entity', () => {
    const panel = panelTitle();
    const route = routeTitle();

    const found = document.querySelector(entityPageTitleSelector(ENTITY));
    expect(found).toBe(route);
    expect(found).not.toBe(panel);
  });

  it('does not match another entity’s title', () => {
    routeTitle('c3d4e5f6a7b8429c0d1e2f3a4b5c6d7e');

    expect(document.querySelector(entityPageTitleSelector(ENTITY))).toBeNull();
  });
});

describe('the anchors themselves', () => {
  it('mark a title with the entity it names', () => {
    expect(entityPageTitleAnchor(ENTITY)).toEqual({ [ENTITY_PAGE_TITLE_ATTRIBUTE]: ENTITY });
  });

  /** Spread onto an element, so it has to be a present-but-empty attribute rather than a flag. */
  it('mark a content column with a valueless attribute', () => {
    expect(ENTITY_PAGE_CONTENT_ANCHOR).toEqual({ [ENTITY_PAGE_CONTENT_ATTRIBUTE]: '' });

    const column = document.createElement('div');
    column.setAttribute(ENTITY_PAGE_CONTENT_ATTRIBUTE, '');
    expect(column.matches(`[${ENTITY_PAGE_CONTENT_ATTRIBUTE}]`)).toBe(true);
  });
});
