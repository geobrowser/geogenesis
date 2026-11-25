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

  it('keeps the Chat tab selected on a channel, and no other tab on a sub-path', () => {
    const at = (href: string, fullPath: string) =>
      isEntityTabActive({ href, activeTabId: null, fullPath, sidePanel: false });
    expect(at('/space/s/chat', '/space/s/chat/markets')).toBe(true);
    expect(at('/space/s', '/space/s/chat/markets')).toBe(false);
    expect(at('/space/s/chat', '/space/s/chatter')).toBe(false);
  });

  it('keeps Overview selected on a record route when asked to (GEO-3820)', () => {
    const overview = (fullPath: string, activeOnRecordRoutes: boolean) =>
      isEntityTabActive({
        href: '/space/s/claim',
        activeTabId: null,
        fullPath,
        sidePanel: false,
        activeOnRecordRoutes,
      });
    expect(overview('/space/s/claim/debates', true)).toBe(true);
    expect(overview('/space/s/claim', true)).toBe(true);
    expect(overview('/space/s/claim/debates', false)).toBe(false);
    // A sibling entity whose id starts the same is not below this one.
    expect(overview('/space/s/claim2', true)).toBe(false); // Only the record routes: Activity and the others keep their own selection.
    expect(overview('/space/s/claim/activity', true)).toBe(false);
    expect(overview('/space/s/claim/sources?x=1', true)).toBe(true);
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
