import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { GraphClaimList } from './graph-claim-list';

const mocks = vi.hoisted(() => ({
  batches: [] as Array<{ spaceId: string; entityIds: string[] }>,
  settled: new Set<string>(),
  failed: new Set<string>(),
}));

vi.mock('~/core/responses/use-claim-response-summaries', async () => {
  const actual = await vi.importActual<typeof import('~/core/responses/use-claim-response-summaries')>(
    '~/core/responses/use-claim-response-summaries'
  );
  return {
    ...actual,
    useClaimResponseSummaryBatch: ({
      spaceId,
      targets,
    }: {
      spaceId: string;
      targets: Array<{ entityId: string; responseKind: string }>;
    }) => {
      mocks.batches.push({ spaceId, entityIds: targets.map(target => target.entityId) });
      const settled = mocks.settled.has(spaceId);
      return { isSuccess: settled, isPlaceholderData: false, isError: mocks.failed.has(spaceId) };
    },
  };
});

vi.mock('./graph-claim-row', async () => {
  const { useClaimResponseBatchState } = await vi.importActual<
    typeof import('~/core/responses/use-claim-response-summaries')
  >('~/core/responses/use-claim-response-summaries');
  const { useActionContext } = await vi.importActual<typeof import('~/core/action-context-provider')>(
    '~/core/action-context-provider'
  );
  return {
    GraphClaimRow: ({ claim }: { claim: { id: string; name: string } }) => {
      const batch = useClaimResponseBatchState();
      const vote = useActionContext('entity_vote_buttons', 'claim', claim.id)();
      return (
        <li
          data-testid="row"
          data-managed={String(batch.managed)}
          data-ready={String(batch.managed && batch.ready)}
          data-vote={`${vote.list_id}#${vote.item_position}@${vote.page_type}`}
        >
          {claim.name}
        </li>
      );
    },
  };
});

const A = 'a'.repeat(32);
const B = 'b'.repeat(32);
const claim = (n: number, spaceId: string) => ({ id: String(n).repeat(32), name: `Claim ${n}`, spaceId });

afterEach(() => {
  cleanup();
  mocks.batches.length = 0;
  mocks.settled.clear();
  mocks.failed.clear();
});

describe('GraphClaimList', () => {
  it('asks once per page and claim space, not once per claim, and keeps the rows in order', () => {
    render(<GraphClaimList pages={[[claim(1, A), claim(2, B), claim(3, A)], [claim(4, A)]]} />);

    const asked = mocks.batches.map(batch => `${batch.spaceId.slice(0, 1)}:${batch.entityIds.length}`);
    expect(new Set(asked)).toEqual(new Set(['a:2', 'b:1', 'a:1']));
    expect(screen.getAllByTestId('row').map(row => row.textContent)).toEqual([
      'Claim 1',
      'Claim 2',
      'Claim 3',
      'Claim 4',
    ]);
  });

  it('scopes each vote to the explorer’s claim list, numbered across pages', () => {
    window.history.replaceState({}, '', `/explore/graph/${A}?topic=${B}`);
    render(<GraphClaimList pages={[[claim(1, A), claim(2, B)], [claim(3, A)]]} />);

    expect(screen.getAllByTestId('row').map(row => row.dataset.vote)).toEqual([
      'graph_explorer_claims#1@graph_explorer',
      'graph_explorer_claims#2@graph_explorer',
      'graph_explorer_claims#3@graph_explorer',
    ]);
  });

  it('holds each row until its own space’s batch has answered', () => {
    mocks.settled.add(A);
    render(<GraphClaimList pages={[[claim(1, A), claim(2, B)]]} />);

    const [inA, inB] = screen.getAllByTestId('row');
    expect(inA.dataset.ready).toBe('true');
    expect(inB.dataset.ready).toBe('false');
  });

  it('lets a row read its own responses after its space’s batch failed', () => {
    mocks.failed.add(B);
    render(<GraphClaimList pages={[[claim(1, A), claim(2, B)]]} />);

    const [inA, inB] = screen.getAllByTestId('row');
    expect(inA.dataset.managed).toBe('true');
    expect(inB.dataset.managed).toBe('false');
  });
});
