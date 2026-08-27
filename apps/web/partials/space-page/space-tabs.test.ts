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

    expect(tabs.map(tab => tab.label)).toEqual(['Overview', 'Facts', 'Sources', 'Activity']);
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

    expect(tabs.map(tab => tab.label)).toEqual([
      'Overview',
      'Facts',
      'Sources',
      'Debates',
      'Governance',
      'Activity',
    ]);
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

    expect(tabs.map(tab => tab.label)).toEqual(['Overview', 'Facts', 'Sources', 'Debug debates', 'Activity']);
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
