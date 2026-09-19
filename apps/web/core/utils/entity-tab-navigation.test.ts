import { describe, expect, it } from 'vitest';

import { entityTabIdFromHref, isEntityTabActive } from './entity-tab-navigation';

const TAB_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('entity tab navigation', () => {
  it('reads valid authored tab ids and rejects unrelated query strings', () => {
    expect(entityTabIdFromHref(`/claim?tabId=${TAB_ID}`)).toBe(TAB_ID);
    expect(entityTabIdFromHref('/claim?filter=recent')).toBeNull();
    expect(entityTabIdFromHref('/claim?tabId=not-an-id')).toBeNull();
  });

  it('uses the route path outside the side panel', () => {
    expect(
      isEntityTabActive({
        href: '/claim/debates',
        activeTabId: null,
        fullPath: '/claim/debates',
        sidePanel: false,
      })
    ).toBe(true);
  });

  it('keeps system and authored side-panel tabs mutually exclusive', () => {
    expect(
      isEntityTabActive({
        href: '/claim/sources',
        activeTabId: null,
        fullPath: '/claim',
        sidePanel: true,
        sidePanelKey: 'sources',
        activeSystemTab: 'sources',
      })
    ).toBe(true);

    expect(
      isEntityTabActive({
        href: `/claim?tabId=${TAB_ID}`,
        activeTabId: TAB_ID,
        fullPath: '/claim',
        sidePanel: true,
        activeSystemTab: null,
      })
    ).toBe(true);
  });
});
