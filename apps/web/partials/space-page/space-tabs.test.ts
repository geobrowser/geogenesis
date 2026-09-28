import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { buildSpaceTabs } from './space-tabs';

const spaceId = 'space-id';
const overviewHref = `/space/${spaceId}`;
const dynamicTabs = [
  { label: 'Facts', href: `${overviewHref}?tabId=facts` },
  { label: 'Sources', href: `${overviewHref}?tabId=sources` },
];

describe('buildSpaceTabs', () => {
  it('omits system Claims and Debates tabs', () => {
    const tabs = buildSpaceTabs({
      spaceId,
      overviewHref,
      dynamicTabs,
      typeIds: [SystemIds.SPACE_TYPE],
      isProfile: false,
      isDebugDebatesPageEnabled: false,
    });

    expect(tabs.map(tab => tab.label)).toEqual(['Overview', 'Facts', 'Sources', 'Governance', 'Activity']);
    expect(tabs.find(tab => tab.label === 'Claims')).toBeUndefined();
    expect(tabs.find(tab => tab.label === 'Debates')).toBeUndefined();
  });

  it('keeps personal spaces from showing Governance', () => {
    const tabs = buildSpaceTabs({
      spaceId,
      overviewHref,
      dynamicTabs,
      typeIds: [SystemIds.SPACE_TYPE, SystemIds.PERSON_TYPE],
      isProfile: true,
      isDebugDebatesPageEnabled: false,
    });

    // No Governance — a personal space has none — and no Activity, which
    // Proposals stands in for. The authored tabs go last, behind a rule.
    expect(tabs.find(tab => tab.label === 'Governance')).toBeUndefined();
    expect(tabs.find(tab => tab.label === 'Activity')).toBeUndefined();
    expect(tabs.map(tab => tab.label)).toEqual([
      'Overview',
      'Debates',
      'Positions',
      'Proposals',
      'Facts',
      'Sources',
      'About',
    ]);
    expect(tabs.find(tab => tab.label === 'Facts')?.dividerBefore).toBe(true);
    expect(tabs.find(tab => tab.label === 'Sources')?.dividerBefore).toBe(false);

    // About reaches the rail's content, so it shows only where the rail has
    // dropped itself — below 1024px.
    expect(tabs.find(tab => tab.label === 'About')?.onlyWhenNarrow).toBe(true);
  });

  it('keeps an authored Claims tab because the system tab is no longer shown', () => {
    const tabs = buildSpaceTabs({
      spaceId,
      overviewHref,
      dynamicTabs: [...dynamicTabs, { label: 'Claims', href: `${overviewHref}?tabId=dynamic-claims` }],
      typeIds: [SystemIds.SPACE_TYPE],
      isProfile: false,
      isDebugDebatesPageEnabled: false,
    });

    expect(tabs.map(tab => tab.label)).toEqual(['Overview', 'Facts', 'Sources', 'Claims', 'Governance', 'Activity']);
    expect(tabs.find(tab => tab.label === 'Claims')?.href).toBe(`${overviewHref}?tabId=dynamic-claims`);
  });

  it('keeps an authored Debates tab because the system tab is no longer shown', () => {
    const tabs = buildSpaceTabs({
      spaceId,
      overviewHref,
      dynamicTabs: [...dynamicTabs, { label: 'Debates', href: `${overviewHref}?tabId=dynamic-debates` }],
      typeIds: [SystemIds.SPACE_TYPE],
      isProfile: false,
      isDebugDebatesPageEnabled: false,
    });

    expect(tabs.map(tab => tab.label)).toEqual(['Overview', 'Facts', 'Sources', 'Debates', 'Governance', 'Activity']);
    expect(tabs.find(tab => tab.label === 'Debates')?.href).toBe(`${overviewHref}?tabId=dynamic-debates`);
  });

  it('inserts Debug debates after authored tabs when only its flag is enabled', () => {
    const tabs = buildSpaceTabs({
      spaceId,
      overviewHref,
      dynamicTabs,
      typeIds: [SystemIds.SPACE_TYPE],
      isProfile: false,
      isDebugDebatesPageEnabled: true,
    });

    expect(tabs.map(tab => tab.label)).toEqual([
      'Overview',
      'Facts',
      'Sources',
      'Debug debates',
      'Debug rooms',
      'Governance',
      'Activity',
    ]);
    expect(tabs.find(tab => tab.label === 'Debug debates')?.href).toBe(`/space/${spaceId}/debug-debates`);
    expect(tabs.find(tab => tab.label === 'Debug rooms')?.href).toBe(`/space/${spaceId}/debug-debate-rooms`);
  });

  it('shows Debug debates in personal spaces without Governance', () => {
    const tabs = buildSpaceTabs({
      spaceId,
      overviewHref,
      dynamicTabs,
      typeIds: [SystemIds.SPACE_TYPE, SystemIds.PERSON_TYPE],
      isProfile: true,
      isDebugDebatesPageEnabled: true,
    });

    expect(tabs.map(tab => tab.label)).toEqual([
      'Overview',
      'Debug debates',
      'Debug rooms',
      'Debates',
      'Positions',
      'Proposals',
      'Facts',
      'Sources',
      'About',
    ]);
  });

  /**
   * A tab that leads nowhere is not drawn (GEO-2859).
   *
   * Most people have never opened a proposal, so on most profiles Proposals is
   * a third of the navigation spent on "No proposals yet".
   */
  describe('a person whose record is partly empty', () => {
    const personTabs = (counts?: { debates: number; positions: number; proposals: number }) =>
      buildSpaceTabs({
        spaceId,
        overviewHref,
        dynamicTabs: [],
        typeIds: [SystemIds.SPACE_TYPE, SystemIds.PERSON_TYPE],
        isProfile: true,
        isDebugDebatesPageEnabled: false,
        personRecordCounts: counts ? { ...counts, totalDebates: counts.debates } : undefined,
      })
        .map(tab => tab.label)
        .filter(label => ['Debates', 'Positions', 'Proposals'].includes(label));

    it('drops the tabs holding nothing', () => {
      expect(personTabs({ debates: 10, positions: 59, proposals: 0 })).toEqual(['Debates', 'Positions']);
    });

    it('drops all three for a record that is entirely empty', () => {
      expect(personTabs({ debates: 0, positions: 0, proposals: 0 })).toEqual([]);
    });

    it('keeps a tab holding exactly one', () => {
      expect(personTabs({ debates: 1, positions: 0, proposals: 0 })).toEqual(['Debates']);
    });

    it('keeps the owner route to debates when every debate is hidden', () => {
      const tabs = buildSpaceTabs({
        spaceId,
        overviewHref,
        dynamicTabs: [],
        typeIds: [SystemIds.SPACE_TYPE, SystemIds.PERSON_TYPE],
        isProfile: true,
        isDebugDebatesPageEnabled: false,
        isOwner: true,
        personRecordCounts: { debates: 0, totalDebates: 1, positions: 0, proposals: 0 },
      });

      expect(tabs.map(tab => tab.label)).toContain('Debates');
    });

    it('does not expose an empty public Debates route to a visitor', () => {
      const tabs = buildSpaceTabs({
        spaceId,
        overviewHref,
        dynamicTabs: [],
        typeIds: [SystemIds.SPACE_TYPE, SystemIds.PERSON_TYPE],
        isProfile: true,
        isDebugDebatesPageEnabled: false,
        isOwner: false,
        personRecordCounts: { debates: 0, totalDebates: 1, positions: 0, proposals: 0 },
      });

      expect(tabs.map(tab => tab.label)).not.toContain('Debates');
    });

    /*
     * The counts come from a request that can fail, and the failure is reported
     * as "unknown" rather than as zero. Read as zero it would hide a tab holding
     * hundreds of rows, which is the one outcome worse than an empty tab.
     */
    it('shows everything when the counts could not be read', () => {
      expect(personTabs(undefined)).toEqual(['Debates', 'Positions', 'Proposals']);
    });
  });

  it('gives a person their own record tabs, and a space none of them', () => {
    const person = buildSpaceTabs({
      spaceId,
      overviewHref,
      dynamicTabs: [],
      typeIds: [SystemIds.SPACE_TYPE, SystemIds.PERSON_TYPE],
      isProfile: true,
      isDebugDebatesPageEnabled: false,
    });

    // Routes, not tab ids: these are pages of their own, not authored tabs on
    // the home entity.
    expect(person.filter(tab => ['Debates', 'Positions', 'Proposals'].includes(tab.label))).toEqual([
      { label: 'Debates', href: `/space/${spaceId}/debates`, priority: 4 },
      { label: 'Positions', href: `/space/${spaceId}/positions`, priority: 4 },
      { label: 'Proposals', href: `/space/${spaceId}/proposals`, priority: 4 },
    ]);
    // Nothing separates them from Overview: the rule marks where the space's
    // own tabs end, and with no authored tabs there is nothing to separate.
    expect(person.some(tab => tab.dividerBefore)).toBe(false);
    expect(person.map(tab => tab.label)).toEqual(['Overview', 'Debates', 'Positions', 'Proposals', 'About']);

    const space = buildSpaceTabs({
      spaceId,
      overviewHref,
      dynamicTabs: [],
      typeIds: [SystemIds.SPACE_TYPE],
      isProfile: false,
      isDebugDebatesPageEnabled: false,
    });

    expect(space.map(tab => tab.label)).toEqual(['Overview', 'Governance', 'Activity']);
  });

  it("keeps a person's record routes from being shadowed by an authored tab", () => {
    const tabs = buildSpaceTabs({
      spaceId,
      overviewHref,
      dynamicTabs: [
        { label: 'Debates', href: `${overviewHref}?tabId=dynamic-debates` },
        { label: 'About', href: `${overviewHref}?tabId=dynamic-about` },
      ],
      typeIds: [SystemIds.SPACE_TYPE, SystemIds.PERSON_TYPE],
      isProfile: true,
      isDebugDebatesPageEnabled: false,
    });

    // The dedupe is first-wins, so an authored tab of the same name would take
    // the route's place — and on a profile these four *are* the record, with
    // About the only path to the rail's facts below 1024px, where the rail drops
    // itself. Shadowing one does not replace it, it makes it unreachable.
    expect(tabs.filter(tab => tab.label === 'Debates')).toEqual([
      { label: 'Debates', href: `/space/${spaceId}/debates`, priority: 4 },
    ]);
    expect(tabs.find(tab => tab.label === 'About')?.href).toBe(`/space/${spaceId}/about`);
    expect(tabs.map(tab => tab.label)).toEqual(['Overview', 'Debates', 'Positions', 'Proposals', 'About']);
  });

  it('leaves an ordinary space free to author any of those names', () => {
    // The reservation is a profile's. A space renders none of those system tabs,
    // so a "Debates" tab there is the space's own and nothing is displaced.
    const tabs = buildSpaceTabs({
      spaceId,
      overviewHref,
      dynamicTabs: [{ label: 'Debates', href: `${overviewHref}?tabId=dynamic-debates` }],
      typeIds: [SystemIds.SPACE_TYPE],
      isProfile: false,
      isDebugDebatesPageEnabled: false,
    });

    expect(tabs.find(tab => tab.label === 'Debates')?.href).toBe(`${overviewHref}?tabId=dynamic-debates`);
  });

  it('gives a Person written into a DAO space the DAO tabs', () => {
    // `isProfile` is the space's classification, not the entity's type. A Person
    // page inside a DAO used to be handed Positions, Proposals and About links
    // whose route guards answer 404, and lost Governance and Activity with it.
    const tabs = buildSpaceTabs({
      spaceId,
      overviewHref,
      dynamicTabs: [],
      typeIds: [SystemIds.SPACE_TYPE, SystemIds.PERSON_TYPE],
      isProfile: false,
      isDebugDebatesPageEnabled: false,
    });

    expect(tabs.map(tab => tab.label)).toEqual(['Overview', 'Governance', 'Activity']);
  });

  it('keeps the system Debug debates route when an authored tab has the same label', () => {
    const tabs = buildSpaceTabs({
      spaceId,
      overviewHref,
      dynamicTabs: [...dynamicTabs, { label: 'Debug debates', href: `${overviewHref}?tabId=debug-debates` }],
      typeIds: [SystemIds.SPACE_TYPE],
      isProfile: false,
      isDebugDebatesPageEnabled: true,
    });

    expect(tabs.filter(tab => tab.label === 'Debug debates')).toEqual([
      { label: 'Debug debates', href: `/space/${spaceId}/debug-debates`, priority: 3 },
    ]);
  });
});
