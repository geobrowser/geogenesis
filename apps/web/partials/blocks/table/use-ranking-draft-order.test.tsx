import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { useBestDebatesPlacement } from './best-debates/use-best-debates-placement';
import { useRankingDraftOrder } from './use-ranking-draft-order';

vi.mock('~/core/analytics-operations', () => ({ recordAction: vi.fn() }));
vi.mock('./best-debates/ranking-compare-debate-player', () => ({ RankingCompareDebatePlayer: () => null }));

afterEach(cleanup);

let latest: string[] = [];

/** The screen's draft order and the placement flow, with the published order under test control. */
function Screen({
  published,
  keepLocalChanges,
  publish,
}: {
  published: string[];
  keepLocalChanges: boolean;
  publish: (ids: string[]) => Promise<boolean>;
}) {
  const [orderedIds, setOrderedIds, markPublished] = useRankingDraftOrder(published, keepLocalChanges);
  latest = orderedIds;
  const placement = useBestDebatesPlacement({
    blockId: 'block',
    orderedIds,
    setOrderedIds,
    hasUnpublishedChanges: false,
    nameOf: id => id,
    toRankIds: [],
    // As the screen does: a publish that went out moves the merge base.
    publish: async ids => {
      const ok = await publish(ids);
      if (ok) markPublished(ids);
      return ok;
    },
    isSaving: false,
  });
  return (
    <>
      <button type="button" onClick={() => placement.start('B', 'to_rank')}>
        start
      </button>
      <button type="button" onClick={() => setOrderedIds([...orderedIds, 'dragged'])}>
        drag
      </button>
      <button type="button" onClick={() => setOrderedIds(orderedIds.filter(id => id !== 'B'))}>
        remove B
      </button>
      <button type="button" onClick={() => setOrderedIds(['B', ...orderedIds.filter(id => id !== 'B')])}>
        move B to the top
      </button>
      {placement.dialogs}
    </>
  );
}

describe('the draft order when the published ballot changes', () => {
  it('keeps a placement waiting on Placed when an earlier publish is indexed meanwhile', async () => {
    const publish = vi.fn(async (_ids: string[]) => true);
    const view = render(<Screen published={['x', 'y']} keepLocalChanges publish={publish} />);
    fireEvent.click(screen.getByText('start'));
    // Better than y, worse than x: between them.
    fireEvent.keyDown(screen.getByRole('dialog'), { key: '1' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: '2' });
    expect(latest).toEqual(['x', 'B', 'y']);

    // Debate A, placed and published just before, finishes indexing: the published order changes.
    view.rerender(<Screen published={['A', 'x', 'y']} keepLocalChanges publish={publish} />);
    expect(latest).toEqual(['A', 'x', 'B', 'y']);
    expect(screen.getByText('Placed #3 of 4')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    });
    expect(publish).toHaveBeenCalledWith(['A', 'x', 'B', 'y']);
  });

  it('re-seeds a clean draft to the new published order', () => {
    const view = render(<Screen published={['x']} keepLocalChanges publish={vi.fn()} />);
    view.rerender(<Screen published={['y', 'x']} keepLocalChanges publish={vi.fn()} />);
    expect(latest).toEqual(['y', 'x']);
  });

  it('keeps every other block replacing the draft, as before', () => {
    const view = render(<Screen published={['x']} keepLocalChanges={false} publish={vi.fn()} />);
    fireEvent.click(screen.getByText('drag'));
    expect(latest).toEqual(['x', 'dragged']);
    view.rerender(<Screen published={['y']} keepLocalChanges={false} publish={vi.fn()} />);
    expect(latest).toEqual(['y']);
  });

  it('keeps a change to a just-published debate when that publish lands', async () => {
    const publish = vi.fn(async (_ids: string[]) => true);
    const view = render(<Screen published={['x', 'y']} keepLocalChanges publish={publish} />);
    fireEvent.click(screen.getByText('start'));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: '=' }); // below y
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    });
    expect(publish).toHaveBeenCalledWith(['x', 'y', 'B']);

    // While it indexes, the ranker moves B up; then the published order lands.
    fireEvent.click(screen.getByText('move B to the top'));
    view.rerender(<Screen published={['x', 'y', 'B']} keepLocalChanges publish={publish} />);
    expect(latest).toEqual(['B', 'x', 'y']);
  });

  it('keeps a removal of a just-published debate when that publish lands', async () => {
    const publish = vi.fn(async (_ids: string[]) => true);
    const view = render(<Screen published={['x', 'y']} keepLocalChanges publish={publish} />);
    fireEvent.click(screen.getByText('start'));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: '=' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    });
    fireEvent.click(screen.getByText('remove B'));
    view.rerender(<Screen published={['x', 'y', 'B']} keepLocalChanges publish={publish} />);
    expect(latest).toEqual(['x', 'y']);
  });

  it('puts the placed debate back where it was placed if the draft lost it before Done', async () => {
    const publish = vi.fn(async (_ids: string[]) => true);
    render(<Screen published={['x', 'y']} keepLocalChanges publish={publish} />);
    fireEvent.click(screen.getByText('start'));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: '1' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: '2' }); // between x and y
    fireEvent.click(screen.getByText('remove B'));
    expect(latest).toEqual(['x', 'y']);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    });
    expect(publish).toHaveBeenCalledWith(['x', 'B', 'y']);
  });
});
