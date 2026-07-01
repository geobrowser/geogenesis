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
  it('omits Questions when the feature flag is disabled', () => {
    const tabs = buildSpaceTabs({
      spaceId,
      overviewHref,
      dynamicTabs,
      typeIds: [SystemIds.SPACE_TYPE],
      questionsTabEnabled: false,
    });

    expect(tabs.map(tab => tab.label)).toEqual(['Overview', 'Facts', 'Sources', 'Governance', 'Activity']);
  });

  it('inserts Questions after content tabs and before Governance when enabled', () => {
    const tabs = buildSpaceTabs({
      spaceId,
      overviewHref,
      dynamicTabs,
      typeIds: [SystemIds.SPACE_TYPE],
      questionsTabEnabled: true,
    });

    expect(tabs.map(tab => tab.label)).toEqual(['Overview', 'Facts', 'Sources', 'Questions', 'Governance', 'Activity']);
    expect(tabs.find(tab => tab.label === 'Questions')?.href).toBe(`/space/${spaceId}/questions`);
  });

  it('keeps personal spaces from showing Governance while still showing Questions', () => {
    const tabs = buildSpaceTabs({
      spaceId,
      overviewHref,
      dynamicTabs,
      typeIds: [SystemIds.SPACE_TYPE, SystemIds.PERSON_TYPE],
      questionsTabEnabled: true,
    });

    expect(tabs.map(tab => tab.label)).toEqual(['Overview', 'Facts', 'Sources', 'Questions', 'Activity']);
  });
});
