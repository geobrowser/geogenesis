import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useActionScope } from '~/core/action-context-provider';
import { useClaimResponseBatchState } from '~/core/responses/use-claim-response-summaries';

import type { ClaimSummaryModel, ClaimVoteTarget, SubClaimModel, TopicRecentDebateModel } from '../models';
import { ClaimTemplate } from '../views/claim-template';
import { claimRowResult } from './claim-explorer';
import {
  ClaimExplorer,
  ClaimVoteBinding,
  ClaimVotePills,
  EntityActionProvider,
  RecentDebatesGallery,
  TemplateClaimVote,
  type TemplateVoteBinding,
  TemplateVoteRows,
} from './index';

const mocks = vi.hoisted(() => ({
  respond: vi.fn(),
  control: {} as Record<string, unknown>,
  state: {} as Record<string, unknown>,
  useDebateClaims: vi.fn(),
  useDebateClaimsBySpaces: vi.fn(),
  useClaimResponseState: vi.fn(),
  useClaimPositionControl: vi.fn(),
  useClaimResponseSummaryBatch: vi.fn(),
  /** The batch state each row's response state was read under. */
  batchStates: [] as Array<{ claimId: string; managed: boolean; ready: boolean }>,
  /** The action scope each control was rendered under: what its vote's analytics would carry. */
  scopes: [] as Array<{ claimId: string; list_id?: string; list_section_id?: string; item_position?: number }>,
}));

vi.mock('~/core/debates/hooks', () => ({
  useDebateClaims: (...args: unknown[]) => mocks.useDebateClaims(...args),
  useDebateClaimsBySpaces: (...args: unknown[]) => mocks.useDebateClaimsBySpaces(...args),
}));
vi.mock('~/core/claims/browse/use-claim-response-state', () => ({
  useClaimResponseState: (...args: unknown[]) => {
    // The real summary hook stands its per-row reads down under a managed batch.
    const batch = useClaimResponseBatchState();
    mocks.batchStates.push({ claimId: (args[0] as { claimId: string }).claimId, ...batch });
    return mocks.useClaimResponseState(...args);
  },
}));
vi.mock('~/core/responses/use-claim-response-summaries', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/responses/use-claim-response-summaries')>()),
  useClaimResponseSummaryBatch: (...args: unknown[]) => mocks.useClaimResponseSummaryBatch(...args),
}));
vi.mock('~/core/debates/matchmaking/matchmaking-claim-card', () => ({
  useClaimPositionControl: (...args: unknown[]) => {
    // The real control reads this scope for its `action_completed` / `local_vote` attribution.
    const scope = useActionScope();
    const { claim } = args[0] as { claim: { claim_entity_id: string } };
    mocks.scopes.push({
      claimId: claim.claim_entity_id,
      list_id: scope.list_id,
      list_section_id: scope.list_section_id,
      item_position: scope.item_position,
    });
    return mocks.useClaimPositionControl(...args);
  },
}));

const TARGET: ClaimVoteTarget = { claimId: 'claim-1', spaceId: 'space-1', title: 'Rents fall when supply rises' };

function setControl(overrides: Record<string, unknown> = {}) {
  mocks.control = {
    viewerPosition: null,
    respond: mocks.respond,
    actionTitle: (position: boolean) => (position ? 'Agree' : 'Disagree'),
    responseError: null,
    canRespond: true,
    isResponseSubmitting: false,
    isResponsePending: false,
    localVoteSide: null,
    isConnected: true,
    ...overrides,
  };
}

function setState(overrides: Record<string, unknown> = {}) {
  mocks.state = {
    claim: { id: 'claim-1', space_id: 'space-1', claim_entity_id: 'claim-1', claim: TARGET.title },
    positions: [],
    readiness: { response_kind: 'stance', viewer_response: null },
    isResponseKindResolved: true,
    isViewerResponseResolved: true,
    responseBlockedReason: null,
    summary: { positive: 0, negative: 0, total: 0, hasCounts: false },
    ...overrides,
  };
}

beforeEach(() => {
  mocks.scopes = [];
  mocks.batchStates = [];
  mocks.useClaimResponseSummaryBatch
    .mockReset()
    .mockReturnValue({ isError: false, isSuccess: true, isPlaceholderData: false });
  mocks.respond.mockReset();
  mocks.useDebateClaims.mockReset().mockReturnValue({ data: undefined });
  mocks.useDebateClaimsBySpaces.mockReset().mockReturnValue({ claims: [] });
  mocks.useClaimResponseState.mockReset().mockImplementation((args: { claimId: string }) => ({
    ...mocks.state,
    claim: { ...(mocks.state.claim as object), claim_entity_id: args.claimId },
  }));
  mocks.useClaimPositionControl.mockReset().mockImplementation(() => mocks.control);
  setControl();
  setState();
});

afterEach(cleanup);

// The buttons carry no counts (the debates app's don't, GEO-3845), so the binding's counts are read
// through a probe beside them.
const withCounts = (title: string) =>
  function VoteWithCounts(vote: TemplateVoteBinding) {
    return (
      <>
        <ClaimVotePills title={title} vote={vote} />
        <span data-testid="agree-count">{vote.agreeCount}</span>
        <span data-testid="disagree-count">{vote.disagreeCount}</span>
      </>
    );
  };

function renderVote(target: ClaimVoteTarget = TARGET, counts: { agree?: number; disagree?: number } = {}) {
  return render(
    <TemplateClaimVote target={target} agreeCount={counts.agree} disagreeCount={counts.disagree}>
      {withCounts(target.title)}
    </TemplateClaimVote>
  );
}

const agreePill = () => screen.getByRole('button', { name: /^Agree/ });
const disagreePill = () => screen.getByRole('button', { name: /^Disagree/ });

describe('TemplateClaimVote', () => {
  it('publishes through the shared claim control, with signed-out votes allowed', () => {
    renderVote();
    fireEvent.click(agreePill());

    expect(mocks.respond).toHaveBeenCalledWith(true);
    expect(mocks.useClaimPositionControl).toHaveBeenCalledWith(
      expect.objectContaining({ allowsSignedOutVotes: true, offersDebate: false, answersReady: true })
    );
  });

  it('pressing the held side sends the same side again, which the control treats as a clear', () => {
    setControl({ viewerPosition: true });
    renderVote();

    expect(agreePill()).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(agreePill());
    expect(mocks.respond).toHaveBeenCalledWith(true);

    fireEvent.click(disagreePill());
    expect(mocks.respond).toHaveBeenLastCalledWith(false);
  });

  it('a signed-out press still reaches the control, which keeps the vote on the device', () => {
    // Signed out the control is not connected but can respond, because signed-out votes are allowed.
    setControl({ isConnected: false, canRespond: true });
    const { rerender } = renderVote();
    expect(agreePill()).toBeEnabled();
    fireEvent.click(agreePill());
    expect(mocks.respond).toHaveBeenCalledWith(true);

    // The device vote is drawn as the viewer's at once.
    setControl({ isConnected: false, canRespond: true, viewerPosition: true, localVoteSide: true });
    rerender(
      <TemplateClaimVote target={TARGET}>
        {vote => <ClaimVotePills title={TARGET.title} vote={vote} />}
      </TemplateClaimVote>
    );
    expect(agreePill()).toHaveAttribute('aria-pressed', 'true');
  });

  it('is disabled while a vote is submitting, so a double click cannot send a retraction', () => {
    setControl({ viewerPosition: true, isResponseSubmitting: true });
    renderVote();

    expect(agreePill()).toBeDisabled();
    expect(disagreePill()).toBeDisabled();
    fireEvent.click(agreePill());
    expect(mocks.respond).not.toHaveBeenCalled();
  });

  it('is disabled while the control cannot respond', () => {
    setControl({ canRespond: false });
    renderVote();
    expect(agreePill()).toBeDisabled();
  });

  it('never leaves the response state without an entity, so the counts are asked for', () => {
    renderVote();
    const args = mocks.useClaimResponseState.mock.calls[0]![0] as { entity: unknown; row: unknown };
    expect(args.entity).toEqual(expect.objectContaining({ id: 'claim-1', name: TARGET.title }));
    expect(args.row).toBeNull();
  });

  describe('counts drawn from the adapter (totals across spaces)', () => {
    it('does not count the viewer twice when they already voted in the target space', () => {
      setControl({ viewerPosition: true });
      renderVote({ ...TARGET, baselineVote: 'agree' }, { agree: 10, disagree: 4 });

      expect(screen.getByTestId('agree-count')).toHaveTextContent(/^10$/);
      expect(screen.getByTestId('disagree-count')).toHaveTextContent(/^4$/);
    });

    it('adds a new vote in the target space once, on top of a vote held in another space', () => {
      // Adapter total of 10 includes the viewer's vote in another space; none in this one.
      setControl({ viewerPosition: null });
      const { rerender } = renderVote({ ...TARGET, baselineVote: null }, { agree: 10 });
      expect(screen.getByTestId('agree-count')).toHaveTextContent(/^10$/);
      expect(agreePill()).toHaveAttribute('aria-pressed', 'false');

      setControl({ viewerPosition: true });
      rerender(
        <TemplateClaimVote target={{ ...TARGET, baselineVote: null }} agreeCount={10}>
          {withCounts(TARGET.title)}
        </TemplateClaimVote>
      );
      expect(screen.getByTestId('agree-count')).toHaveTextContent(/^11$/);
    });

    it('switching sides moves the vote from one count to the other', () => {
      setControl({ viewerPosition: false });
      renderVote({ ...TARGET, baselineVote: 'agree' }, { agree: 10, disagree: 4 });
      expect(screen.getByTestId('agree-count')).toHaveTextContent(/^9$/);
      expect(screen.getByTestId('disagree-count')).toHaveTextContent(/^5$/);
    });
  });

  it("draws the target space's own counts when the adapter gives no baseline", () => {
    setState({
      summary: { positive: 7, negative: 2, total: 9, hasCounts: true, viewerDirection: 'positive' },
      readiness: { response_kind: 'stance', viewer_response: { position: true } },
    });
    setControl({ viewerPosition: true });
    renderVote(TARGET, { agree: 99, disagree: 99 });

    expect(screen.getByTestId('agree-count')).toHaveTextContent(/^7$/);
    expect(screen.getByTestId('disagree-count')).toHaveTextContent(/^2$/);
  });

  it("does not count a press twice while the target space's summary already counts it", () => {
    // Signed in, pressed Agree, not indexed yet: the summary's optimistic delta already moved the
    // count from 7 to 8 and reports the side, while the indexed answer still says no vote.
    setState({
      summary: { positive: 8, negative: 2, total: 10, hasCounts: true, viewerDirection: 'positive' },
      readiness: { response_kind: 'stance', viewer_response: null },
    });
    setControl({ viewerPosition: true, isResponsePending: true });
    renderVote(TARGET);

    expect(screen.getByTestId('agree-count')).toHaveTextContent(/^8$/);
    expect(screen.getByTestId('disagree-count')).toHaveTextContent(/^2$/);
  });

  it('tells the adapter once a vote from the row is indexed', () => {
    const onSettled = vi.fn();
    const target = { ...TARGET, onSettled };
    setControl({ isResponsePending: true });
    const { rerender } = renderVote(target);
    expect(onSettled).not.toHaveBeenCalled();

    setControl({ isResponsePending: false });
    rerender(
      <TemplateClaimVote target={target}>
        {vote => <ClaimVotePills title={TARGET.title} vote={vote} />}
      </TemplateClaimVote>
    );
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('shows why a vote failed', () => {
    setControl({ responseError: 'Could not save your vote.' });
    renderVote();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save your vote.');
  });
});

describe('ClaimVotePills: the debates app buttons (GEO-3845)', () => {
  it('draws two equal 34px outlined pills that share the row, with no counts on them', () => {
    renderVote(TARGET, { agree: 12, disagree: 3 });
    const group = screen.getByRole('group', { name: `Vote on ${TARGET.title}` });
    expect(group).toHaveClass('w-full');
    for (const pill of [agreePill(), disagreePill()]) {
      expect(pill).toHaveClass('h-[34px]', 'rounded-full', 'border', 'bg-transparent', 'flex-1', 'basis-0');
      // The app's label type (GEO-3857): 14px system face, 18px thumb.
      expect(pill).toHaveClass('text-[14px]', 'tracking-[-0.3px]');
      // Phones keep the app's 4px side padding so "Disagree" fits a 320px row.
      expect(pill).toHaveClass('px-1', '@[760px]:px-3.5', '@[760px]:min-w-[112px]');
      expect(pill.className).toContain('[font-family:-apple-system');
      expect(pill.querySelector('svg')).toHaveClass('size-[18px]');
      expect(pill).not.toHaveTextContent(/\d/);
    }
    expect(agreePill()).toHaveAccessibleName('Agree');
    expect(disagreePill()).toHaveAccessibleName('Disagree');
  });

  it('marks only the held side: ink border, bold label, filled thumb', () => {
    setControl({ viewerPosition: false });
    renderVote();
    expect(disagreePill()).toHaveAttribute('aria-pressed', 'true');
    expect(disagreePill()).toHaveClass('border-[#151515]', 'font-bold');
    expect(disagreePill().querySelector('svg')).toHaveAttribute('data-filled', 'true');
    expect(agreePill()).toHaveAttribute('aria-pressed', 'false');
    expect(agreePill()).toHaveClass('border-[#8a8a8a]', 'font-semibold');
    expect(agreePill().querySelector('svg')).not.toHaveAttribute('data-filled');
  });

  it('a filled-side press retracts through the local binding; the other side switches', () => {
    const onVote = vi.fn();
    const onClearVote = vi.fn();
    const { rerender } = render(
      <ClaimVoteBinding userVote="agree" onVote={onVote} onClearVote={onClearVote}>
        {vote => vote && <ClaimVotePills title={TARGET.title} vote={vote} />}
      </ClaimVoteBinding>
    );
    fireEvent.click(agreePill());
    expect(onClearVote).toHaveBeenCalledTimes(1);
    expect(onVote).not.toHaveBeenCalled();

    rerender(
      <ClaimVoteBinding userVote="agree" onVote={onVote} onClearVote={onClearVote}>
        {vote => vote && <ClaimVotePills title={TARGET.title} vote={vote} />}
      </ClaimVoteBinding>
    );
    fireEvent.click(disagreePill());
    expect(onVote).toHaveBeenCalledWith('disagree');
    expect(onClearVote).toHaveBeenCalledTimes(1);
  });
});

describe('TemplateVoteRows', () => {
  it('looks rows up once for the list instead of once per row', () => {
    const row = { id: 'row-1', space_id: 'space-1', claim_entity_id: 'claim-1' };
    mocks.useDebateClaimsBySpaces.mockReturnValue({ claims: [row] });
    const second: ClaimVoteTarget = { claimId: 'claim-2', spaceId: 'space-1', title: 'Second' };

    render(
      <TemplateVoteRows targets={[TARGET, second, undefined]}>
        {[TARGET, second].map(target => (
          <ClaimVoteBinding key={target.claimId} voteTarget={target}>
            {vote => vote && <ClaimVotePills title={target.title} vote={vote} />}
          </ClaimVoteBinding>
        ))}
      </TemplateVoteRows>
    );

    expect(mocks.useDebateClaimsBySpaces).toHaveBeenCalledWith([
      { spaceId: 'space-1', claimIds: ['claim-1', 'claim-2'] },
    ]);
    // Rows inside the list never fetch on their own.
    for (const call of mocks.useDebateClaims.mock.calls) expect(call[2]).toBe(false);
    const rows = mocks.useClaimResponseState.mock.calls.map(call => (call[0] as { row: unknown }).row);
    expect(rows).toContain(row);
    expect(rows).toContain(null);
  });

  it('reads counts and viewer votes in one batch per space, not per row', () => {
    const second: ClaimVoteTarget = { claimId: 'claim-2', spaceId: 'space-1', title: 'Second' };
    const elsewhere: ClaimVoteTarget = { claimId: 'claim-3', spaceId: 'space-2', title: 'Elsewhere' };
    const targets = [TARGET, second, elsewhere];

    render(
      <TemplateVoteRows targets={targets}>
        {targets.map(target => (
          <ClaimVoteBinding key={target.claimId} voteTarget={target}>
            {vote => vote && <ClaimVotePills title={target.title} vote={vote} />}
          </ClaimVoteBinding>
        ))}
      </TemplateVoteRows>
    );

    const batches = mocks.useClaimResponseSummaryBatch.mock.calls.map(
      call => call[0] as { spaceId: string; targets: { entityId: string }[]; responderMetadata?: boolean }
    );
    const bySpace = new Map(batches.map(batch => [batch.spaceId, batch]));
    expect([...bySpace.keys()].sort()).toEqual(['space-1', 'space-2']);
    expect(bySpace.get('space-1')!.targets.map(target => target.entityId)).toEqual(['claim-1', 'claim-2']);
    expect(bySpace.get('space-2')!.targets.map(target => target.entityId)).toEqual(['claim-3']);
    // Rows draw no responder faces, so the batch skips them.
    for (const batch of batches) expect(batch.responderMetadata).toBe(false);
    // Every row reads under its space's batch, so none asks for its own counts.
    const last = new Map(mocks.batchStates.map(state => [state.claimId, state]));
    for (const target of targets) expect(last.get(target.claimId)).toMatchObject({ managed: true, ready: true });
  });

  it('lets a row read for itself once its space batch fails', () => {
    mocks.useClaimResponseSummaryBatch.mockReturnValue({ isError: true, isSuccess: false, isPlaceholderData: false });

    render(
      <TemplateVoteRows targets={[TARGET]}>
        <ClaimVoteBinding voteTarget={TARGET}>
          {vote => vote && <ClaimVotePills title={TARGET.title} vote={vote} />}
        </ClaimVoteBinding>
      </TemplateVoteRows>
    );

    expect(mocks.batchStates.at(-1)).toMatchObject({ claimId: 'claim-1', managed: false });
  });

  it('mounts no lookup for a list with nothing to vote on', () => {
    render(<TemplateVoteRows targets={[undefined]}>plain</TemplateVoteRows>);
    expect(mocks.useDebateClaimsBySpaces).not.toHaveBeenCalled();
    expect(mocks.useClaimResponseSummaryBatch).not.toHaveBeenCalled();
  });
});

describe('ClaimExplorer voting', () => {
  const claim = (overrides: Partial<ClaimSummaryModel>): ClaimSummaryModel => ({
    id: 'claim-1',
    title: TARGET.title,
    split: { rows: [], isSplit: true, totalVotes: 3 },
    agreeCount: 2,
    disagreeCount: 1,
    ...overrides,
  });

  it('a row with a vote target saves through the control, not the local handler', () => {
    const onVote = vi.fn();
    render(
      <EntityActionProvider>
        <ClaimExplorer contestedClaims={[claim({ voteTarget: TARGET, onVote, userVote: null })]} agreedClaims={[]} />
      </EntityActionProvider>
    );

    fireEvent.click(agreePill());
    expect(mocks.respond).toHaveBeenCalledWith(true);
    expect(onVote).not.toHaveBeenCalled();
  });

  // The buttons carry no counts (GEO-3845), so the row's result has to follow the viewer's press.
  it("a row's result follows the viewer's vote at once, not only the fetched split", () => {
    const noVotes = claim({
      voteTarget: TARGET,
      userVote: null,
      agreeCount: 0,
      disagreeCount: 0,
      split: { rows: [], isSplit: true },
    });
    const view = render(
      <EntityActionProvider>
        <ClaimExplorer contestedClaims={[noVotes]} agreedClaims={[]} />
      </EntityActionProvider>
    );
    expect(screen.getByText('No votes yet')).toBeInTheDocument();
    expect(screen.queryAllByRole('meter')).toHaveLength(0);
    view.unmount();

    // The press is drawn: the control now holds Agree, the fetched split still says no votes.
    setControl({ viewerPosition: true });
    render(
      <EntityActionProvider>
        <ClaimExplorer contestedClaims={[noVotes]} agreedClaims={[]} />
      </EntityActionProvider>
    );
    expect(screen.queryByText('No votes yet')).toBeNull();
    expect(screen.getByText('1 vote')).toBeInTheDocument();
    const meters = screen.getAllByRole('meter');
    expect(meters.length).toBeGreaterThan(0);
    for (const meter of meters) expect(meter).toHaveAttribute('aria-valuenow', '100');
  });

  // A Claim page sub-claim's split is one row named for its space, with no Everyone row.
  it("a sub-claim's single space row takes the live numbers, with no second overall row", () => {
    setControl({ viewerPosition: true });
    render(
      <EntityActionProvider>
        <ClaimExplorer
          contestedClaims={[
            claim({
              voteTarget: TARGET,
              userVote: null,
              agreeCount: 1,
              disagreeCount: 1,
              split: {
                rows: [{ id: 'space-1', label: 'AI', color: '#3963fe', percent: 50, voterCount: 2 }],
                isSplit: true,
                totalVotes: 2,
              },
            }),
          ]}
          agreedClaims={[]}
        />
      </EntityActionProvider>
    );
    expect(screen.getByText('3 votes')).toBeInTheDocument();
    // One inline meter (wide) and one phone row: the space row, at 2 of 3.
    const meters = screen.getAllByRole('meter');
    expect(meters).toHaveLength(2);
    for (const meter of meters) expect(meter).toHaveAttribute('aria-valuenow', '67');
    expect(screen.queryByText('Everyone')).toBeNull();
  });

  it('a switched vote moves the inline percentage and keeps the total', () => {
    setControl({ viewerPosition: false });
    setState({ readiness: { response_kind: 'stance', viewer_response: { position: true } } });
    render(
      <EntityActionProvider>
        <ClaimExplorer
          contestedClaims={[
            claim({
              voteTarget: TARGET,
              userVote: 'agree',
              agreeCount: 5,
              disagreeCount: 2,
              split: {
                rows: [
                  { id: 'all', label: 'Everyone', color: '#202020', percent: 71, voterCount: 7, isEveryone: true },
                ],
                isSplit: true,
                totalVotes: 7,
              },
            }),
          ]}
          agreedClaims={[]}
        />
      </EntityActionProvider>
    );
    expect(screen.getByText('7 votes')).toBeInTheDocument();
    // 4 of 7 agree once the viewer's Agree turns into Disagree.
    const meters = screen.getAllByRole('meter');
    expect(meters.length).toBeGreaterThan(0);
    for (const meter of meters) expect(meter).toHaveAttribute('aria-valuenow', '57');
  });

  describe('claimRowResult: which row takes the live overall numbers', () => {
    const live = { agreeCount: 6, disagreeCount: 4 };
    const pp = { id: 'pp', label: 'Pro-Palestinian', color: '#6833ff', percent: 40, voterCount: 5, isSubspace: true };
    const pi = { id: 'pi', label: 'Pro-Israel', color: '#3963fe', percent: 80, voterCount: 5, isSubspace: true };

    it('an Everyone row after the space rows takes them; the space rows keep their own', () => {
      const everyone = { id: 'all', label: 'Everyone', color: '#202020', percent: 50, voterCount: 8, isEveryone: true };
      const { splitRows, totalVotes } = claimRowResult(
        { split: { rows: [pp, pi, everyone], isSplit: true, totalVotes: 8 } },
        live
      );
      expect(totalVotes).toBe(10);
      expect(splitRows).toEqual([pp, pi, { ...everyone, percent: 60, voterCount: 10 }]);
    });

    it('several space rows and no Everyone row: an Everyone row goes first, no space row is relabeled', () => {
      const { splitRows, totalVotes } = claimRowResult(
        { split: { rows: [pp, pi], isSplit: true, totalVotes: 10 } },
        live
      );
      expect(totalVotes).toBe(10);
      expect(splitRows).toEqual([
        { id: 'all', label: 'Everyone', color: '#202020', percent: 60, voterCount: 10, isEveryone: true },
        pp,
        pi,
      ]);
    });
  });

  it('a row without a target (the fixture) keeps its local handler', () => {
    const onVote = vi.fn();
    render(
      <EntityActionProvider>
        <ClaimExplorer contestedClaims={[claim({ onVote, userVote: null })]} agreedClaims={[]} />
      </EntityActionProvider>
    );

    fireEvent.click(agreePill());
    expect(onVote).toHaveBeenCalledWith('agree');
    expect(mocks.useClaimPositionControl).not.toHaveBeenCalled();
    expect(mocks.useDebateClaimsBySpaces).not.toHaveBeenCalled();
  });
});

describe('list attribution on template votes', () => {
  const lastScope = (claimId: string) => mocks.scopes.filter(scope => scope.claimId === claimId).at(-1);
  const second: ClaimVoteTarget = { claimId: 'claim-2', spaceId: 'space-1', title: 'Second claim' };

  it('names the Claims list and the row on a vote from it', () => {
    const row = (target: ClaimVoteTarget): ClaimSummaryModel => ({
      id: target.claimId,
      title: target.title,
      split: { rows: [], isSplit: true },
      voteTarget: target,
    });
    render(
      <EntityActionProvider>
        <ClaimExplorer contestedClaims={[row(TARGET), row(second)]} agreedClaims={[]} />
      </EntityActionProvider>
    );

    expect(lastScope('claim-1')).toMatchObject({
      list_id: 'template_claims',
      list_section_id: 'split',
      item_position: 1,
    });
    expect(lastScope('claim-2')).toMatchObject({
      list_id: 'template_claims',
      list_section_id: 'split',
      item_position: 2,
    });
  });

  it('tells the Claim page sub-claim groups apart, since each numbers its rows from 1', () => {
    const subClaim = (target: ClaimVoteTarget, stance: 'supports' | 'opposes'): SubClaimModel => ({
      id: target.claimId,
      title: target.title,
      kind: 'judgment',
      stance,
      split: { rows: [], isSplit: false },
      sources: [],
      voteTarget: target,
    });
    render(
      <ClaimTemplate
        model={{
          id: 'parent',
          title: 'Parent claim',
          kind: 'judgment',
          split: { rows: [], isSplit: false },
          voteBox: { userVote: null, countSummary: '0 votes', onVote: vi.fn() },
          sections: [],
          subClaims: [subClaim(TARGET, 'supports'), subClaim(second, 'opposes')],
        }}
      />
    );

    expect(lastScope('claim-1')).toMatchObject({
      list_id: 'template_sub_claims',
      list_section_id: 'supports',
      item_position: 1,
    });
    expect(lastScope('claim-2')).toMatchObject({
      list_id: 'template_sub_claims',
      list_section_id: 'opposes',
      item_position: 1,
    });
  });

  it('draws Recent debates cards with the claim over the video and no vote pills', () => {
    const debate = (id: string, target: ClaimVoteTarget): TopicRecentDebateModel => ({
      id,
      claimId: target.claimId,
      claimTitle: target.title,
      date: 'Nov 20',
      duration: '12 min',
      votesLabel: '3 votes',
      participants: [
        { name: 'Ada', position: 'Agree', communityColor: '#000' },
        { name: 'Bo', position: 'Disagree', communityColor: '#000' },
      ],
      href: `/debate/${id}`,
    });
    const { container } = render(
      <EntityActionProvider>
        <RecentDebatesGallery debates={[debate('debate-1', TARGET), debate('debate-2', second)]} />
      </EntityActionProvider>
    );

    // The card is only the video: no vote pills.
    expect(screen.queryByRole('group', { name: `Vote on ${second.title}` })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Disagree/ })).toBeNull();

    // The card link still names the claim, and the claim shows over the top of the video, two lines max.
    const link = screen.getByRole('link', { name: `Watch debate: ${second.title}` });
    expect(link).toHaveAttribute('href', '/debate/debate-2');
    const overlay = link.querySelector('[data-debate-claim-overlay]');
    expect(overlay).toHaveTextContent(second.title);
    expect(overlay).toHaveClass('top-0');
    expect(overlay?.querySelector('.line-clamp-2')).toHaveTextContent(second.title);

    // Both speaker chips sit at the bottom-left of their own panel.
    const topChip = container.querySelector('[data-speaker-chip="top"]');
    const bottomChip = container.querySelector('[data-speaker-chip="bottom"]');
    expect(topChip).toHaveTextContent('Ada');
    // It rides above the play button at every card width, so a long name never slides under the button.
    expect(topChip).toHaveClass('bottom-7', 'left-2.5');
    expect(topChip?.className).not.toMatch(/(^|\s)(@\[\d+px\]:)?(top-2|bottom-2)(\s|$)/);
    expect(bottomChip).toHaveTextContent('Bo');
    expect(bottomChip).toHaveClass('bottom-2', 'left-2.5');
  });
});
