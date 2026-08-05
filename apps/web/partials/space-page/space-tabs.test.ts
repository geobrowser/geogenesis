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
  it('omits Claims and Debates when the feature flag is disabled', () => {
    const tabs = buildSpaceTabs({
      spaceId,
      overviewHref,
      dynamicTabs,
      typeIds: [SystemIds.SPACE_TYPE],
      isDebatesEnabled: false,
      isDebugDebatesPageEnabled: false,
    });

    expect(tabs.map(tab => tab.label)).toEqual(['Overview', 'Facts', 'Sources', 'Governance', 'Activity']);
  });

  it('inserts Claims and Debates after content tabs and before Governance when enabled', () => {
    const tabs = buildSpaceTabs({
      spaceId,
      overviewHref,
      dynamicTabs,
      typeIds: [SystemIds.SPACE_TYPE],
      isDebatesEnabled: true,
      isDebugDebatesPageEnabled: false,
    });

    expect(tabs.map(tab => tab.label)).toEqual([
      'Overview',
      'Facts',
      'Sources',
      'Claims',
      'Debates',
      'Governance',
      'Activity',
    ]);
    expect(tabs.find(tab => tab.label === 'Claims')?.href).toBe(`/space/${spaceId}/claims`);
    expect(tabs.find(tab => tab.label === 'Debates')?.href).toBe(`/space/${spaceId}/debates`);
  });

  it('keeps personal spaces from showing Governance while still showing Claims and Debates', () => {
    const tabs = buildSpaceTabs({
      spaceId,
      overviewHref,
      dynamicTabs,
      typeIds: [SystemIds.SPACE_TYPE, SystemIds.PERSON_TYPE],
      isDebatesEnabled: true,
      isDebugDebatesPageEnabled: false,
    });

    expect(tabs.map(tab => tab.label)).toEqual(['Overview', 'Facts', 'Sources', 'Claims', 'Debates', 'Activity']);
  });

  it('keeps the system Claims route when a dynamic tab has the same label', () => {
    const tabs = buildSpaceTabs({
      spaceId,
      overviewHref,
      dynamicTabs: [...dynamicTabs, { label: 'Claims', href: `${overviewHref}?tabId=dynamic-claims` }],
      typeIds: [SystemIds.SPACE_TYPE],
      isDebatesEnabled: true,
      isDebugDebatesPageEnabled: false,
    });

    expect(tabs.map(tab => tab.label)).toEqual([
      'Overview',
      'Facts',
      'Sources',
      'Claims',
      'Debates',
      'Governance',
      'Activity',
    ]);
    expect(tabs.find(tab => tab.label === 'Claims')?.href).toBe(`/space/${spaceId}/claims`);
  });

  it('keeps the system Debates route when a dynamic tab has the same label', () => {
    const tabs = buildSpaceTabs({
      spaceId,
      overviewHref,
      dynamicTabs: [...dynamicTabs, { label: 'Debates', href: `${overviewHref}?tabId=dynamic-debates` }],
      typeIds: [SystemIds.SPACE_TYPE],
      isDebatesEnabled: true,
      isDebugDebatesPageEnabled: false,
    });

    expect(tabs.map(tab => tab.label)).toEqual([
      'Overview',
      'Facts',
      'Sources',
      'Claims',
      'Debates',
      'Governance',
      'Activity',
    ]);
    expect(tabs.find(tab => tab.label === 'Debates')?.href).toBe(`/space/${spaceId}/debates`);
  });

  it('inserts Debug debates after authored tabs when only its flag is enabled', () => {
    const tabs = buildSpaceTabs({
      spaceId,
      overviewHref,
      dynamicTabs,
      typeIds: [SystemIds.SPACE_TYPE],
      isDebatesEnabled: false,
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

  it('inserts Debug debates after Debates when both flags are enabled', () => {
    const tabs = buildSpaceTabs({
      spaceId,
      overviewHref,
      dynamicTabs,
      typeIds: [SystemIds.SPACE_TYPE],
      isDebatesEnabled: true,
      isDebugDebatesPageEnabled: true,
    });

    expect(tabs.map(tab => tab.label)).toEqual([
      'Overview',
      'Facts',
      'Sources',
      'Claims',
      'Debates',
      'Debug debates',
      'Governance',
      'Activity',
    ]);
  });

  it('shows Debug debates in personal spaces without Governance', () => {
    const tabs = buildSpaceTabs({
      spaceId,
      overviewHref,
      dynamicTabs,
      typeIds: [SystemIds.SPACE_TYPE, SystemIds.PERSON_TYPE],
      isDebatesEnabled: false,
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
      isDebatesEnabled: false,
      isDebugDebatesPageEnabled: true,
    });

    expect(tabs.filter(tab => tab.label === 'Debug debates')).toEqual([
      { label: 'Debug debates', href: `/space/${spaceId}/debug-debates`, priority: 3 },
    ]);
  });
});
