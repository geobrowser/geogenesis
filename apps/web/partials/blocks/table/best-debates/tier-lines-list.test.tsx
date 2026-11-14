import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { defaultTierLines } from '~/core/blocks/ranking/ranking-grades';

import { TierLinesList, countsAfterLineDrag, tierLinesOrder } from './tier-lines-list';

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

const A = '__tier-line:A';
const B = '__tier-line:B';

afterEach(() => {
  cleanup();
  mocks.calls.length = 0;
});

describe('tier lines (GEO-3729)', () => {
  it('places the lines after the A and B counts', () => {
    expect(tierLinesOrder(['1', '2', '3', '4'], 1, 2)).toEqual(['1', A, '2', '3', B, '4']);
  });

  it('keeps the lines inside the list', () => {
    expect(tierLinesOrder(['1', '2'], 5, 5)).toEqual(['1', '2', A, B]);
  });

  it('reads the counts back after a line is dragged', () => {
    expect(countsAfterLineDrag(['1', '2', A, '3', B, '4'])).toEqual({ aCount: 2, bCount: 1 });
  });

  it('swaps the lines when one is dragged past the other, so A stays on top', () => {
    expect(countsAfterLineDrag(['1', B, '2', '3', A, '4'])).toEqual({ aCount: 1, bCount: 2 });
  });

  it('starts at a fifth A and two fifths B (Preston’s own split of 101: 20 / 40)', () => {
    expect(defaultTierLines(101)).toEqual({ aCount: 20, bCount: 40 });
    expect(defaultTierLines(1)).toEqual({ aCount: 0, bCount: 0 });
  });

  it('draws both lines with their counts and keeps the debates in order', () => {
    render(
      <TierLinesList
        entityIds={['d1', 'd2', 'd3']}
        aCount={1}
        bCount={1}
        onChange={() => undefined}
        renderItem={(id, index) => <span>{`${index + 1} ${id}`}</span>}
      />
    );
    expect(screen.getByRole('button', { name: 'A ends here, A · 1. Drag to move.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'B ends here, B · 1. Drag to move.' })).toBeInTheDocument();
    expect(screen.getAllByText(/^\d d\d$/).map(node => node.textContent)).toEqual(['1 d1', '2 d2', '3 d3']);
  });

  it('keeps the debates as places to drop a line, never to drag', () => {
    render(
      <TierLinesList
        entityIds={['d1', 'd2']}
        aCount={1}
        bCount={0}
        onChange={() => undefined}
        renderItem={id => <span>{id}</span>}
      />
    );
    expect(mocks.calls.find(call => call.id === 'd1')?.disabled).toEqual({ draggable: true, droppable: false });
    expect(mocks.calls.find(call => call.id === A)?.disabled).toBeUndefined();
  });
});
