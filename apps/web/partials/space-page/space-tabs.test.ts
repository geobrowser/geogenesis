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
      questionsTabEnabled: false,
    });

    expect(tabs.map(tab => tab.label)).toEqual(['Overview', 'Facts', 'Sources', 'Governance', 'Activity']);
  });

  it('inserts Claims and Debates after content tabs and before Governance when enabled', () => {
    const tabs = buildSpaceTabs({
      spaceId,
      overviewHref,
      dynamicTabs,
      typeIds: [SystemIds.SPACE_TYPE],
      questionsTabEnabled: true,
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
      questionsTabEnabled: true,
    });

    expect(tabs.map(tab => tab.label)).toEqual(['Overview', 'Facts', 'Sources', 'Claims', 'Debates', 'Activity']);
  });

  it('keeps the system Claims route when a dynamic tab has the same label', () => {
    const tabs = buildSpaceTabs({
      spaceId,
      overviewHref,
      dynamicTabs: [...dynamicTabs, { label: 'Claims', href: `${overviewHref}?tabId=dynamic-claims` }],
      typeIds: [SystemIds.SPACE_TYPE],
      questionsTabEnabled: true,
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
      questionsTabEnabled: true,
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
});
