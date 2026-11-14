import { cleanup, render } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { HEADER_DISABLED, RankingMyRankingDndList } from './ranking-my-ranking-dnd';

const mocks = vi.hoisted(() => ({ calls: [] as Array<{ id: string; disabled?: unknown }> }));

vi.mock('@dnd-kit/sortable', async importOriginal => {
  const actual = await importOriginal<typeof import('@dnd-kit/sortable')>();
  return {
    ...actual,
    useSortable: (args: { id: string; disabled?: unknown }) => {
      mocks.calls.push(args);
      return actual.useSortable(args as Parameters<typeof actual.useSortable>[0]);
    },
  };
});

afterEach(() => {
  cleanup();
  mocks.calls.length = 0;
});

describe('tier headers in the sortable list (GEO-3729)', () => {
  it('never drag, but stay drop targets, so an empty tier can be dropped into', () => {
    render(
      <RankingMyRankingDndList
        entityIds={['x']}
        onReorder={() => undefined}
        groups={[
          { key: 'A', header: <span>A</span>, entityIds: ['x'] },
          { key: 'B', header: <span>B</span>, entityIds: [] },
        ]}
        onRegroup={() => undefined}
        renderItem={id => <span>{id}</span>}
      />
    );
    const header = mocks.calls.find(call => call.id === '__ranking-group:B');
    expect(header?.disabled).toEqual({ draggable: true, droppable: false });
    expect(HEADER_DISABLED.droppable).toBe(false);
    expect(mocks.calls.find(call => call.id === 'x')?.disabled).toBeUndefined();
  });
});
