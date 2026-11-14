import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type PlacementOrigin,
  type UseBestDebatesPlacementArgs,
  useBestDebatesPlacement,
} from './use-best-debates-placement';

const mocks = vi.hoisted(() => ({ recordAction: vi.fn() }));

vi.mock('~/core/analytics-operations', () => ({ recordAction: mocks.recordAction }));
// The compare view's player is swapped for a stub that reports whether it is the one playing.
vi.mock('./ranking-compare-debate-player', () => ({
  RankingCompareDebatePlayer: ({
    label,
    badge,
    active,
    onActivate,
  }: {
    label: string;
    badge?: string;
    active: boolean;
    onActivate: () => void;
  }) => (
    <>
      <span>{badge}</span>
      <button type="button" data-testid="player" data-active={String(active)} onClick={onActivate}>
        play {label}
      </button>
    </>
  ),
}));

const names: Record<string, string> = {};
const list = (n: number) => Array.from({ length: n }, (_, i) => `d${i + 1}`);
for (const id of [...list(30), 'new', 'next']) names[id] = `Debate ${id}`;

type HarnessProps = Partial<UseBestDebatesPlacementArgs> & {
  initial: string[];
  startWith: { id: string; origin: PlacementOrigin };
};

let latestOrder: string[] = [];

function Harness({ initial, startWith, ...rest }: HarnessProps) {
  const [orderedIds, setOrderedIds] = React.useState(initial);
  latestOrder = orderedIds;
  const placement = useBestDebatesPlacement({
    blockId: 'block',
    orderedIds,
    setOrderedIds,
    hasUnpublishedChanges: false,
    nameOf: id => names[id] ?? id,
    toRankIds: [],
    publish: async () => true,
    isSaving: false,
    // Most of these cover the publish-on-Done path; the ranking screen's default is tested below.
    publishOnDone: true,
    ...rest,
  });
  return (
    <>
      <button type="button" onClick={() => placement.start(startWith.id, startWith.origin)}>
        start
      </button>
      <button type="button" onClick={() => placement.reorder(startWith.id)}>
        reorder
      </button>
      {placement.dialogs}
    </>
  );
}

const actionNames = () => mocks.recordAction.mock.calls.map(([name]) => name);

afterEach(cleanup);

beforeEach(() => {
  mocks.recordAction.mockReset();
  latestOrder = [];
});

describe('placing a debate by comparison', () => {
  it('compares against the middle of the list, halves it per choice, and places it', () => {
    render(<Harness initial={list(4)} startWith={{ id: 'new', origin: 'team' }} />);
    fireEvent.click(screen.getByText('start'));

    // 4 debates: first shown is #3 (index 2).
    expect(screen.getByText('#3 in your ranking')).toBeTruthy();
    expect(screen.getByText(/Step 1 of about 3/)).toBeTruthy();

    // The new one was better than #3, then worse than #2.
    fireEvent.click(screen.getByRole('button', { name: 'Debate new was better' }));
    expect(screen.getByText('#2 in your ranking')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Debate d2 was better' }));

    expect(latestOrder).toEqual(['d1', 'd2', 'new', 'd3', 'd4']);
    expect(screen.getByText('Placed #3 of 5')).toBeTruthy();
    expect(actionNames()).toEqual([
      'ranking_place_started',
      'ranking_compare_step',
      'ranking_compare_step',
      'ranking_placed',
    ]);
  });

  it('"About the same" places it straight below the debate shown, and keys work too', () => {
    render(<Harness initial={list(4)} startWith={{ id: 'new', origin: 'team' }} />);
    fireEvent.click(screen.getByText('start'));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: '=' });
    expect(latestOrder).toEqual(['d1', 'd2', 'd3', 'new', 'd4']);
  });

  it('plays only one side at a time', () => {
    render(<Harness initial={list(4)} startWith={{ id: 'new', origin: 'team' }} />);
    fireEvent.click(screen.getByText('start'));
    const [left, right] = screen.getAllByTestId('player');
    expect([left.dataset.active, right.dataset.active]).toEqual(['false', 'false']);
    fireEvent.click(left);
    expect([left.dataset.active, right.dataset.active]).toEqual(['true', 'false']);
    fireEvent.click(right);
    expect([left.dataset.active, right.dataset.active]).toEqual(['false', 'true']);
  });

  it('leaves the list untouched when the comparison is closed part way', () => {
    render(<Harness initial={list(4)} startWith={{ id: 'new', origin: 'team' }} />);
    fireEvent.click(screen.getByText('start'));
    fireEvent.click(screen.getByRole('button', { name: 'Debate new was better' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(latestOrder).toEqual(list(4));
    expect(actionNames().at(-1)).toBe('ranking_place_cancelled');
  });

  it('goes back a comparison with its answer undone, by Back or Backspace, and not past the first', () => {
    render(<Harness initial={list(8)} startWith={{ id: 'new', origin: 'team' }} />);
    fireEvent.click(screen.getByText('start'));
    // Step 1 compares with the middle of eight (#5); no Back yet.
    expect(screen.getByText('#5 in your ranking')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Back/ })).toBeNull();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: '2' });
    expect(screen.getByText('#7 in your ranking')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(screen.getByText('#5 in your ranking')).toBeTruthy();
    expect(screen.getByText('Step 1 of about 4')).toBeTruthy();

    // Answering the other way from the rewound step takes the other branch.
    fireEvent.keyDown(screen.getByRole('dialog'), { key: '1' });
    expect(screen.getByText('#3 in your ranking')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Backspace' });
    expect(screen.getByText('#5 in your ranking')).toBeTruthy();
    expect(latestOrder).toEqual(list(8));
  });

  it('on the ranking screen, Done and Rank the next one only change the draft', async () => {
    const publish = vi.fn(async (_ids: string[]) => true);
    render(
      <Harness
        initial={list(2)}
        startWith={{ id: 'new', origin: 'to_rank' }}
        toRankIds={['next']}
        publish={publish}
        publishOnDone={false}
      />
    );
    fireEvent.click(screen.getByText('start'));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: '1' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: '1' });
    expect(screen.getByText(/Added to your draft, not published yet/)).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Rank the next one/ }));
    });
    expect(publish).not.toHaveBeenCalled();
    expect(latestOrder).toEqual(['new', 'd1', 'd2']);
    // The next debate's comparison is open; finishing it and pressing Done still publishes nothing.
    fireEvent.keyDown(screen.getByRole('dialog'), { key: '2' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: '2' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    });
    expect(publish).not.toHaveBeenCalled();
    expect(latestOrder).toEqual(['new', 'd1', 'd2', 'next']);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('publishes once on Done, with nudges, as one edit', async () => {
    const publish = vi.fn(async (_ids: string[]) => true);
    render(<Harness initial={list(2)} startWith={{ id: 'new', origin: 'team' }} publish={publish} />);
    fireEvent.click(screen.getByText('start'));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: '1' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: '1' });
    expect(latestOrder).toEqual(['new', 'd1', 'd2']);
    expect(publish).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Move down' }));
    expect(latestOrder).toEqual(['d1', 'new', 'd2']);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(['d1', 'new', 'd2']);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the neighbours of a 200-debate placement and takes about 8 choices', () => {
    render(
      <Harness initial={Array.from({ length: 200 }, (_, i) => `x${i}`)} startWith={{ id: 'new', origin: 'team' }} />
    );
    fireEvent.click(screen.getByText('start'));
    let choices = 0;
    while (screen.queryByText(/in your ranking/)) {
      fireEvent.keyDown(screen.getByRole('dialog'), { key: '2' });
      choices++;
    }
    expect(choices).toBeLessThanOrEqual(8);
    expect(screen.getByText('Placed #201 of 201')).toBeTruthy();
    expect(screen.getByTestId('placed-neighbours').querySelectorAll('li')).toHaveLength(3);
  });

  it('offers "Rank the next one" only when started from To rank', async () => {
    const publish = vi.fn(async (_ids: string[]) => true);
    const { unmount } = render(
      <Harness initial={[]} startWith={{ id: 'new', origin: 'team' }} toRankIds={['next']} publish={publish} />
    );
    fireEvent.click(screen.getByText('start'));
    expect(screen.getByText('Placed #1 of 1')).toBeTruthy();
    expect(screen.queryByText(/Rank the next one/)).toBeNull();
    unmount();

    render(
      <Harness
        initial={[]}
        startWith={{ id: 'new', origin: 'to_rank' }}
        toRankIds={['new', 'next']}
        publish={publish}
      />
    );
    fireEvent.click(screen.getByText('start'));
    const next = screen.getByRole('button', { name: 'Rank the next one · 1 left' });
    await act(async () => {
      fireEvent.click(next);
    });
    expect(publish).toHaveBeenCalledWith(['new']);
    // The next debate's comparison opens against the one just placed.
    expect(screen.getByText('#1 in your ranking')).toBeTruthy();
  });

  it('Rank goes straight to the comparison, which has no Push it down', () => {
    render(<Harness initial={list(3)} startWith={{ id: 'new', origin: 'team' }} pushDown={{ onSelect: vi.fn() }} />);
    fireEvent.click(screen.getByText('start'));
    expect(screen.getByText('Which was the better debate?')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Rank it|Push it down|Down rank/ })).toBeNull();
  });

  it('places the first debate of an empty ranking at #1 with no comparison', () => {
    render(<Harness initial={[]} startWith={{ id: 'new', origin: 'team' }} pushDown={{ onSelect: vi.fn() }} />);
    fireEvent.click(screen.getByText('start'));
    expect(screen.getByText('Placed #1 of 1')).toBeTruthy();
    expect(latestOrder).toEqual(['new']);
  });

  it("runs the Done publish through Push it down's clearing step when GEO-3679 provides one", async () => {
    const publish = vi.fn(async (_ids: string[]) => true);
    const rank = vi.fn(async (_id: string, run: () => Promise<boolean>) => run());
    render(
      <Harness
        initial={[]}
        startWith={{ id: 'new', origin: 'team' }}
        publish={publish}
        pushDown={{ onSelect: vi.fn(), rank }}
      />
    );
    fireEvent.click(screen.getByText('start'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    });
    expect(rank).toHaveBeenCalledWith('new', expect.any(Function));
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('closes the confirmation without publishing, and keeps the placement as a draft change', () => {
    const publish = vi.fn(async (_ids: string[]) => true);
    render(<Harness initial={['d1']} startWith={{ id: 'new', origin: 'team' }} publish={publish} />);
    fireEvent.click(screen.getByText('start'));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: '1' });
    expect(screen.getByText('Placed #1 of 2')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(publish).not.toHaveBeenCalled();
    expect(latestOrder).toEqual(['new', 'd1']);
  });

  it('says so when Done fails, and can still be closed', async () => {
    const publish = vi.fn(async (_ids: string[]) => false);
    render(<Harness initial={[]} startWith={{ id: 'new', origin: 'team' }} publish={publish} />);
    fireEvent.click(screen.getByText('start'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    });
    expect(screen.getByRole('alert').textContent).toContain('wasn’t published');
    expect(screen.getByRole('dialog')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(publish).toHaveBeenCalledTimes(1);
    expect(latestOrder).toEqual(['new']);
  });

  it('after Rank the next one, the next placement has no other changes to mention', async () => {
    // The parent still reports unpublished changes from the render before the publish landed.
    render(
      <Harness initial={[]} startWith={{ id: 'new', origin: 'to_rank' }} toRankIds={['next']} hasUnpublishedChanges />
    );
    fireEvent.click(screen.getByText('start'));
    expect(screen.getByText('Done publishes it with your other unpublished changes.')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Rank the next one · 1 left' }));
    });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: '1' });
    expect(screen.getByText('Placed #1 of 2')).toBeTruthy();
    expect(screen.getByText('Nudge it if it’s not quite right. Done publishes it.')).toBeTruthy();
  });

  it("a row's Push it down waits until the ranker's vote is known", () => {
    const onSelect = vi.fn();
    function RowHarness({ ready }: { ready: boolean }) {
      const [orderedIds, setOrderedIds] = React.useState<string[]>([]);
      const placement = useBestDebatesPlacement({
        blockId: 'block',
        orderedIds,
        setOrderedIds,
        hasUnpublishedChanges: false,
        nameOf: id => id,
        toRankIds: [],
        publish: async () => true,
        isSaving: false,
        pushDown: { onSelect, isReady: () => ready },
      });
      return (
        <>
          <button type="button" onClick={() => placement.requestPushDown('new')}>
            push
          </button>
          <span data-testid="active">{placement.activeEntityId ?? ''}</span>
        </>
      );
    }
    const { rerender } = render(<RowHarness ready={false} />);
    fireEvent.click(screen.getByText('push'));
    // The debate is bound (active) while its vote loads, and nothing is sent yet.
    expect(screen.getByTestId('active').textContent).toBe('new');
    expect(onSelect).not.toHaveBeenCalled();
    rerender(<RowHarness ready />);
    expect(onSelect).toHaveBeenCalledWith('new');
    expect(screen.getByTestId('active').textContent).toBe('');
  });
});

describe('Re-order from the watch popup (GEO-3729)', () => {
  it('opens the Placed step at the debate’s place, and its arrows move it there', () => {
    render(<Harness initial={list(4)} startWith={{ id: 'd3', origin: 'mine' }} />);
    fireEvent.click(screen.getByText('reorder'));
    expect(screen.getByText('Placed #3 of 4')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Move up' }));
    expect(latestOrder).toEqual(['d1', 'd3', 'd2', 'd4']);
  });

  it('publishes the moved list on Done where Done publishes (the block)', async () => {
    const publish = vi.fn(async () => true);
    render(<Harness initial={list(3)} startWith={{ id: 'd2', origin: 'mine' }} publish={publish} />);
    fireEvent.click(screen.getByText('reorder'));
    fireEvent.click(screen.getByRole('button', { name: 'Move down' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Done' })));
    expect(publish).toHaveBeenCalledWith(['d1', 'd3', 'd2']);
  });

  it('does nothing for a debate that isn’t in the ranking', () => {
    render(<Harness initial={list(3)} startWith={{ id: 'new', origin: 'mine' }} />);
    fireEvent.click(screen.getByText('reorder'));
    expect(screen.queryByText(/Placed #/)).toBeNull();
  });
});
