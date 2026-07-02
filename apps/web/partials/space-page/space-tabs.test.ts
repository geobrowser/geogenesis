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
  it('omits Questions and Debates when the feature flag is disabled', () => {
    const tabs = buildSpaceTabs({
      spaceId,
      overviewHref,
      dynamicTabs,
      typeIds: [SystemIds.SPACE_TYPE],
      questionsTabEnabled: false,
    });

    expect(tabs.map(tab => tab.label)).toEqual(['Overview', 'Facts', 'Sources', 'Governance', 'Activity']);
  });

  it('inserts Questions and Debates after content tabs and before Governance when enabled', () => {
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
      'Questions',
      'Debates',
      'Governance',
      'Activity',
    ]);
    expect(tabs.find(tab => tab.label === 'Questions')?.href).toBe(`/space/${spaceId}/questions`);
    expect(tabs.find(tab => tab.label === 'Debates')?.href).toBe(`/space/${spaceId}/debates`);
  });

  it('keeps personal spaces from showing Governance while still showing Questions and Debates', () => {
    const tabs = buildSpaceTabs({
      spaceId,
      overviewHref,
      dynamicTabs,
      typeIds: [SystemIds.SPACE_TYPE, SystemIds.PERSON_TYPE],
      questionsTabEnabled: true,
    });

    expect(tabs.map(tab => tab.label)).toEqual(['Overview', 'Facts', 'Sources', 'Questions', 'Debates', 'Activity']);
  });

  it('keeps the system Questions route when a dynamic tab has the same label', () => {
    const tabs = buildSpaceTabs({
      spaceId,
      overviewHref,
      dynamicTabs: [...dynamicTabs, { label: 'Questions', href: `${overviewHref}?tabId=dynamic-questions` }],
      typeIds: [SystemIds.SPACE_TYPE],
      questionsTabEnabled: true,
    });

    expect(tabs.map(tab => tab.label)).toEqual([
      'Overview',
      'Facts',
      'Sources',
      'Questions',
      'Debates',
      'Governance',
      'Activity',
    ]);
    expect(tabs.find(tab => tab.label === 'Questions')?.href).toBe(`/space/${spaceId}/questions`);
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
      'Questions',
      'Debates',
      'Governance',
      'Activity',
    ]);
    expect(tabs.find(tab => tab.label === 'Debates')?.href).toBe(`/space/${spaceId}/debates`);
  });
});
