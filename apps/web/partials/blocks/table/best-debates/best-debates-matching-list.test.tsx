import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BestDebateRowData } from '~/core/blocks/ranking/use-best-debate-displays';

import { BestDebatesMatchingList } from './best-debates-matching-list';

const mocks = vi.hoisted(() => ({
  debates: [] as { entityId: string; name: string; createdAtMs: number; spaceId: string }[],
  displays: new Map<string, BestDebateRowData>(),
}));

vi.mock('./use-best-debates-matching-list', () => ({
  useBestDebatesMatchingList: () => ({ debates: mocks.debates, capped: false, loading: false, error: null }),
}));
vi.mock('~/core/blocks/ranking/use-best-debate-displays', () => ({
  useBestDebateDisplays: () => mocks.displays,
}));

afterEach(cleanup);

const display = (spaceId: string, name: string): BestDebateRowData => ({
  entityId: '',
  title: '',
  debaterSpaceIds: [],
  ownSpaceId: spaceId,
  createdAtMs: null,
  topics: [{ id: 'dating', name: 'Dating' }],
  keyframeUrl: null,
  debaters: null,
  space: { id: spaceId, name, image: null },
});

// 82 debates carry Dating (what the Topic menu counts): 60 in Relationships, 22 in Culture.
function seed() {
  mocks.debates = Array.from({ length: 82 }, (_, i) => ({
    entityId: `d${i}`,
    name: `Debate ${i}`,
    createdAtMs: i,
    spaceId: i < 60 ? 'rel' : 'cul',
  }));
  mocks.displays = new Map(
    mocks.debates.map(debate => [
      debate.entityId,
      debate.spaceId === 'rel' ? display('rel', 'Relationships') : display('cul', 'Culture'),
    ])
  );
}

describe('BestDebatesMatchingList', () => {
  it('lists every matching debate, as many as the facet counts, however few are on screen elsewhere', () => {
    seed();
    render(
      <BestDebatesMatchingList
        query=""
        topicIds={['dating']}
        grouped={false}
        rankOf={() => undefined}
        render={id => <div key={id} data-testid="row" />}
      />
    );
    expect(screen.getAllByTestId('row')).toHaveLength(82);
    expect(screen.getByTestId('best-debates-matching-count').textContent).toBe('82 debates');
  });

  it('counts whole groups in By space, summing to the facet count', () => {
    seed();
    render(
      <BestDebatesMatchingList
        query=""
        topicIds={['dating']}
        grouped
        rankOf={() => undefined}
        render={id => <div key={id} data-testid="row" />}
      />
    );
    const groups = screen.getAllByTestId('space-group');
    expect(
      groups.map(group => [group.getAttribute('aria-label'), group.querySelectorAll('[data-testid="row"]').length])
    ).toEqual([
      ['Culture', 22],
      ['Relationships', 60],
    ]);
    expect(groups[0]!.textContent).toContain('Culture · 22');
  });
});
