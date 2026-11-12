import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PUSH_DOWN_LIVE_NOTE, type PushDownState } from '~/core/blocks/ranking/push-down';
import type { PushedDownDebate } from '~/core/blocks/ranking/use-my-pushed-down-debates';

import { RankingComposePushedDown } from './ranking-compose-pushed-down';

const mocks = vi.hoisted(() => ({
  live: false,
  undo: vi.fn(),
  retry: vi.fn(),
  byDebate: {} as Record<string, { state: PushDownState; isInBallot: boolean; isPushedDown: boolean }>,
}));

vi.mock('~/core/blocks/ranking/best-debates', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/blocks/ranking/best-debates')>()),
  get BEST_DEBATES_RANKING_LIVE() {
    return mocks.live;
  },
}));

vi.mock('~/core/blocks/ranking/use-push-down', () => ({
  usePushDown: (debateId: string) => ({
    enabled: true,
    debateSpaceId: 'space',
    pushDown: vi.fn(),
    rankAfterClearing: vi.fn(),
    undo: mocks.undo,
    retry: mocks.retry,
    ...(mocks.byDebate[debateId] ?? { state: { status: 'idle' }, isInBallot: false, isPushedDown: true }),
  }),
}));

vi.mock('./ranking-entry-row', () => ({
  RankingEntryRow: ({ entry, actions }: { entry: { name: string }; actions?: React.ReactNode }) => (
    <div>
      <span>{entry.name}</span>
      {actions}
    </div>
  ),
}));

const debate = (id: string, name: string): PushedDownDebate => ({
  entityId: id,
  name,
  description: null,
  image: null,
  debateSpaceId: '1234567890abcdef1234567890abcdef',
  downvotedSpaceIds: ['1234567890abcdef1234567890abcdef'],
});

beforeEach(() => {
  mocks.live = false;
  mocks.undo.mockReset();
  mocks.retry.mockReset();
  mocks.byDebate = {};
});

afterEach(() => cleanup());

describe('RankingComposePushedDown', () => {
  it('lists the debates the member pushed down, each with Undo', () => {
    render(
      <RankingComposePushedDown
        blockId="block"
        debates={[debate('d1', 'First debate'), debate('d2', 'Second debate')]}
        isError={false}
        onRetryLoad={() => {}}
      />
    );

    expect(screen.getByText('You pushed down · 2')).toBeTruthy();
    expect(screen.getByText('First debate')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo push down: Second debate' }));
    expect(mocks.undo).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when there is nothing pushed down', () => {
    const { container } = render(
      <RankingComposePushedDown blockId="block" debates={[]} isError={false} onRetryLoad={() => {}} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('promises nothing about the feed before the cutover', () => {
    render(
      <RankingComposePushedDown blockId="block" debates={[debate('d1', 'A')]} isError={false} onRetryLoad={() => {}} />
    );
    expect(screen.queryByText(PUSH_DOWN_LIVE_NOTE)).toBeNull();
    expect(document.body.textContent).not.toMatch(/feed/i);
  });

  it('shows the feed note once the ranking is live', () => {
    mocks.live = true;
    render(
      <RankingComposePushedDown blockId="block" debates={[debate('d1', 'A')]} isError={false} onRetryLoad={() => {}} />
    );
    expect(screen.getByText(PUSH_DOWN_LIVE_NOTE)).toBeTruthy();
  });

  it('shows a failed second step with Retry, and the debate as still ranked', () => {
    mocks.byDebate.d1 = {
      state: {
        status: 'failed',
        action: 'push-down',
        step: 'ballot',
        partly: true,
        message: 'Still in your ranking. Retry.',
      },
      isInBallot: true,
      isPushedDown: true,
    };
    render(
      <RankingComposePushedDown blockId="block" debates={[debate('d1', 'A')]} isError={false} onRetryLoad={() => {}} />
    );
    expect(screen.getByRole('alert').textContent).toBe('Still in your ranking. Retry.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.retry).toHaveBeenCalledTimes(1);
  });

  it('labels a pushed-down debate that is still on the ballot', () => {
    mocks.byDebate.d1 = { state: { status: 'idle' }, isInBallot: true, isPushedDown: true };
    render(
      <RankingComposePushedDown blockId="block" debates={[debate('d1', 'A')]} isError={false} onRetryLoad={() => {}} />
    );
    expect(screen.getByText('Still in your ranking')).toBeTruthy();
  });

  it('renders a row for every counted downvote, so the count matches the rows', () => {
    mocks.byDebate.d1 = { state: { status: 'idle' }, isInBallot: false, isPushedDown: false };
    render(
      <RankingComposePushedDown
        blockId="block"
        debates={[debate('d1', 'Cast elsewhere'), debate('d2', 'Kept')]}
        isError={false}
        onRetryLoad={() => {}}
      />
    );
    expect(screen.getByText('You pushed down · 2')).toBeTruthy();
    expect(screen.getByText('Cast elsewhere')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Undo push down/ })).toHaveLength(2);
  });
});
