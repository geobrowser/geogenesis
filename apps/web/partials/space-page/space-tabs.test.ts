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
      isDebugDebatesPageEnabled: true,
    });

    expect(tabs.map(tab => tab.label)).toEqual([
      'Overview',
      'Facts',
      'Sources',
      'Debug debates',
      'Governance',
      'Activity',
    ]);
    expect(tabs.find(tab => tab.label === 'Debug debates')?.href).toBe(`/space/${spaceId}/debug-debates`);
  });

  it('shows Debug debates in personal spaces without Governance', () => {
    const tabs = buildSpaceTabs({
      spaceId,
      overviewHref,
      dynamicTabs,
      typeIds: [SystemIds.SPACE_TYPE, SystemIds.PERSON_TYPE],
      isDebugDebatesPageEnabled: true,
    });

    expect(tabs.map(tab => tab.label)).toEqual([
      'Overview',
      'Debug debates',
      'Debates',
      'Positions',
      'Proposals',
      'Facts',
      'Sources',
      'About',
    ]);
  });

  it('gives a person their own record tabs, and a space none of them', () => {
    const person = buildSpaceTabs({
      spaceId,
      overviewHref,
      dynamicTabs: [],
      typeIds: [SystemIds.SPACE_TYPE, SystemIds.PERSON_TYPE],
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
      isDebugDebatesPageEnabled: false,
    });

    expect(space.map(tab => tab.label)).toEqual(['Overview', 'Governance', 'Activity']);
  });

  it("lets a person's authored Debates tab win over the system one", () => {
    const tabs = buildSpaceTabs({
      spaceId,
      overviewHref,
      dynamicTabs: [{ label: 'Debates', href: `${overviewHref}?tabId=dynamic-debates` }],
      typeIds: [SystemIds.SPACE_TYPE, SystemIds.PERSON_TYPE],
      isDebugDebatesPageEnabled: false,
    });

    expect(tabs.filter(tab => tab.label === 'Debates')).toEqual([
      { label: 'Debates', href: `${overviewHref}?tabId=dynamic-debates`, priority: 6, dividerBefore: true },
    ]);
    // The authored one takes the system tab's place *and* its own, so it lands
    // after the rule with the rest of what this person wrote.
    expect(tabs.map(tab => tab.label)).toEqual(['Overview', 'Positions', 'Proposals', 'Debates', 'About']);
  });

  it('keeps the system Debug debates route when an authored tab has the same label', () => {
    const tabs = buildSpaceTabs({
      spaceId,
      overviewHref,
      dynamicTabs: [...dynamicTabs, { label: 'Debug debates', href: `${overviewHref}?tabId=debug-debates` }],
      typeIds: [SystemIds.SPACE_TYPE],
      isDebugDebatesPageEnabled: true,
    });

    expect(tabs.filter(tab => tab.label === 'Debug debates')).toEqual([
      { label: 'Debug debates', href: `/space/${spaceId}/debug-debates`, priority: 3 },
    ]);
  });
});
