import { describe, expect, it } from 'vitest';

import { entityTabIdFromHref, isEntityTabActive } from './entity-tab-navigation';

const TAB_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('entity tab navigation', () => {
  it('reads valid authored tab ids and rejects unrelated query strings', () => {
    expect(entityTabIdFromHref(`/claim?tabId=${TAB_ID}`)).toBe(TAB_ID);
    expect(entityTabIdFromHref('/claim?filter=recent')).toBeNull();
    expect(entityTabIdFromHref('/claim?tabId=not-an-id')).toBeNull();
  });

  it('matches the exact tabId parameter instead of text in another key or value', () => {
    expect(entityTabIdFromHref(`/claim?notabId=${TAB_ID}`)).toBeNull();
    expect(entityTabIdFromHref(`/claim?redirect=tabId%3D${TAB_ID}`)).toBeNull();
  });

  it('parses tabId in any query position without including the fragment', () => {
    expect(entityTabIdFromHref(`/claim?filter=recent&tabId=${TAB_ID}#activity`)).toBe(TAB_ID);
  });

  it('uses the first tabId value when the parameter is repeated', () => {
    const secondTabId = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    expect(entityTabIdFromHref(`/claim?tabId=${TAB_ID}&tabId=${secondTabId}`)).toBe(TAB_ID);
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

    expect(
      isEntityTabActive({
        href: '/claim',
        activeTabId: TAB_ID,
        fullPath: '/claim',
        sidePanel: true,
        sidePanelKey: 'overview',
        activeSystemTab: null,
      })
    ).toBe(false);
  });
});
