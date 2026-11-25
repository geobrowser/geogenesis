'use client';

import * as React from 'react';

import { useClaimResponseState } from '~/core/claims/browse/use-claim-response-state';
import type { DebateClaim } from '~/core/debates/api';
import { useDebateClaims, useDebateClaimsBySpaces } from '~/core/debates/hooks';
import { useClaimPositionControl } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { ID } from '~/core/id';
import type { Entity } from '~/core/types';

import { ClaimBatchRow, type ClaimBatchStatus, useClaimSpaceBatches } from '~/partials/graph-explorer/graph-claim-list';

import { type ClaimVoteTarget, type VoteChoice } from '../models';
import { DebateVoteButtons } from './debate-vote-buttons';

type Side = Exclude<VoteChoice, null>;

/** What a row's Agree / Disagree pills draw and do, whichever way the vote is held. */
export interface TemplateVoteBinding {
  userVote: VoteChoice;
  agreeCount?: number;
  disagreeCount?: number;
  disabled: boolean;
  /** Press a side: the held side clears, the other side switches. */
  press: (choice: Side) => void;
  /** Tooltip for a side's pill, when the control has something to say about it. */
  titleFor: (choice: Side) => string | undefined;
  /** Why the last vote failed to publish, shown under the pills. */
  error: string | null;
}

/**
 * The binding for a row that keeps its vote in the caller's own state — the Gaza fixture. Null when
 * the row has no vote handler at all, so it draws no pills.
 */
export function localVoteBinding({
  userVote,
  agreeCount,
  disagreeCount,
  onVote,
  onClearVote,
}: {
  userVote?: VoteChoice;
  agreeCount?: number;
  disagreeCount?: number;
  onVote?: (choice: Side) => void;
  onClearVote?: () => void;
}): TemplateVoteBinding | null {
  if (!onVote) return null;
  return {
    userVote: userVote ?? null,
    agreeCount,
    disagreeCount,
    disabled: false,
    error: null,
    titleFor: () => undefined,
    press: choice => {
      if (userVote === choice && onClearVote) {
        onClearVote();
        return;
      }
      onVote(choice);
    },
  };
}

function choiceFromPosition(position: boolean | null | undefined): VoteChoice {
  if (position === true) return 'agree';
  if (position === false) return 'disagree';
  return null;
}

function choiceFromDirection(direction: 'positive' | 'negative' | null | undefined): VoteChoice {
  if (direction === 'positive') return 'agree';
  if (direction === 'negative') return 'disagree';
  return null;
}

/**
 * A side's count with the viewer's server vote swapped for the vote drawn now, so a press moves the
 * count at once and a vote the server already counted is never counted twice.
 */
export function adjustedVoteCount(base: number, side: Side, serverVote: VoteChoice, liveVote: VoteChoice) {
  return Math.max(0, base - (serverVote === side ? 1 : 0) + (liveVote === side ? 1 : 0));
}

/**
 * Agree / Disagree on a template list row that saves the vote (GEO-3819).
 *
 * The same chain as the Explore feed card and Related claims: geo-chat's row, then
 * `useClaimResponseState`, then `useClaimPositionControl` with signed-out votes allowed — so a
 * signed-in press publishes, and a signed-out press is kept on this device and opens the global
 * save-votes sheet. Hooks are per claim, which is why this is a component the list mounts per row.
 */
export function TemplateClaimVote({
  target,
  agreeCount,
  disagreeCount,
  row,
  children,
}: {
  target: ClaimVoteTarget;
  /** The counts the row would draw without a vote of its own. */
  agreeCount?: number;
  disagreeCount?: number;
  /**
   * geo-chat's row from the list's single lookup, or null where it has none. Leave undefined and
   * the row looks itself up.
   */
  row?: DebateClaim | null;
  children: (vote: TemplateVoteBinding) => React.ReactNode;
}) {
  const { claimId, spaceId, title } = target;
  const claimIds = React.useMemo(() => [claimId], [claimId]);
  const rowQuery = useDebateClaims(spaceId, claimIds, row === undefined);
  const resolvedRow =
    row !== undefined ? row : (rowQuery.data?.claims.find(claim => claim.claim_entity_id === claimId) ?? null);

  // Never null: without an entity or a row the response state counts the claim as unresolved and
  // never asks for its counts, which leaves the pills on "Loading…" for good in the spaces geo-chat
  // does not index. A stub has no local edits, so it can never block a vote either.
  const providedEntity = target.entity;
  const entity = React.useMemo<Entity>(
    () =>
      providedEntity ?? {
        id: claimId,
        name: title,
        description: null,
        spaces: [spaceId],
        types: [],
        relations: [],
        values: [],
      },
    [claimId, providedEntity, spaceId, title]
  );

  const state = useClaimResponseState({ claimId, spaceId, row: resolvedRow, entity, title });
  const answersReady = state.isResponseKindResolved && state.isViewerResponseResolved;
  const control = useClaimPositionControl({
    claim: state.claim,
    positions: state.positions,
    readiness: state.readiness,
    answersReady,
    responseBlockedReason: state.responseBlockedReason,
    allowsSignedOutVotes: true,
    offersDebate: false,
  });

  // Tell the adapter once a vote from this row is on chain, so counts it reads from its own query
  // (the split bars) catch up instead of waiting out that query's stale time.
  const { onSettled } = target;
  const wasPending = React.useRef(false);
  React.useEffect(() => {
    if (control.isResponsePending) {
      wasPending.current = true;
      return;
    }
    if (!wasPending.current) return;
    wasPending.current = false;
    onSettled?.();
  }, [control.isResponsePending, onSettled]);

  const usesBaseline = target.baselineVote !== undefined;
  const serverVote: VoteChoice = usesBaseline
    ? (target.baselineVote ?? null)
    : choiceFromPosition(state.readiness.viewer_response?.position);
  // Until the control knows the viewer's side, draw the server's answer rather than an empty pair.
  const liveVote: VoteChoice =
    control.viewerPosition !== null || answersReady ? choiceFromPosition(control.viewerPosition) : serverVote;

  const ownCounts = !usesBaseline && state.summary.hasCounts;
  const baseAgree = ownCounts ? state.summary.positive : (agreeCount ?? 0);
  const baseDisagree = ownCounts ? state.summary.negative : (disagreeCount ?? 0);
  // The vote the base counts already hold for the viewer. The summary counts a vote still being
  // indexed (`viewerDirection` is that side), while `serverVote` waits for the index: swapping
  // `serverVote` there would count a fresh press twice until the index caught up.
  const countedVote: VoteChoice = ownCounts ? choiceFromDirection(state.summary.viewerDirection) : serverVote;

  // `respond` has no double-press guard of its own: a second press before the bundler has the write
  // would send a retraction. The pills carry the gate, as `ResponseButton` does on master.
  const disabled = !control.canRespond || control.isResponseSubmitting;

  return (
    <>
      {children({
        userVote: liveVote,
        agreeCount: adjustedVoteCount(baseAgree, 'agree', countedVote, liveVote),
        disagreeCount: adjustedVoteCount(baseDisagree, 'disagree', countedVote, liveVote),
        disabled,
        error: control.responseError,
        titleFor: choice => control.actionTitle(choice === 'agree'),
        press: choice => {
          if (disabled) return;
          control.respond(choice === 'agree');
        },
      })}
    </>
  );
}

function voteRowKey(spaceId: string, claimId: string) {
  return `${ID.uuidToHex(spaceId).toLowerCase()}:${ID.uuidToHex(claimId).toLowerCase()}`;
}

type TemplateVoteRowsValue = {
  /** geo-chat's row for a target, or null where it has none. */
  rowFor: (target: ClaimVoteTarget) => DebateClaim | null;
  /** Where the response batch for a target's space stands. */
  batchStatusFor: (target: ClaimVoteTarget) => ClaimBatchStatus;
};

/** The list's shared lookups; undefined when no `TemplateVoteRows` is mounted. */
const TemplateVoteRowsContext = React.createContext<TemplateVoteRowsValue | undefined>(undefined);

/**
 * One geo-chat lookup and one response batch per space for a list's voting rows, read by each
 * `ClaimVoteBinding` inside. With no targets it mounts nothing.
 */
export function TemplateVoteRows({
  targets,
  children,
}: {
  targets: ReadonlyArray<ClaimVoteTarget | undefined>;
  children: React.ReactNode;
}) {
  const signature = targets
    .filter((target): target is ClaimVoteTarget => Boolean(target))
    .map(target => `${target.spaceId}|${target.claimId}`)
    .join(',');
  if (!signature) return <>{children}</>;
  return <TemplateVoteRowsLookup signature={signature}>{children}</TemplateVoteRowsLookup>;
}

function TemplateVoteRowsLookup({ signature, children }: { signature: string; children: React.ReactNode }) {
  const groups = React.useMemo(() => {
    const bySpace = new Map<string, string[]>();
    for (const entry of signature.split(',')) {
      const [spaceId, claimId] = entry.split('|') as [string, string];
      const ids = bySpace.get(spaceId) ?? [];
      if (!ids.includes(claimId)) ids.push(claimId);
      bySpace.set(spaceId, ids);
    }
    return Array.from(bySpace, ([spaceId, claimIds]) => ({ spaceId, claimIds }));
  }, [signature]);

  const { claims } = useDebateClaimsBySpaces(groups);
  const batchClaims = React.useMemo(
    () => groups.flatMap(({ spaceId, claimIds }) => claimIds.map(id => ({ id, spaceId }))),
    [groups]
  );
  // Rows draw no responder faces, so the batches skip that metadata.
  const { status, batches } = useClaimSpaceBatches(batchClaims, { responderMetadata: false });

  const value = React.useMemo<TemplateVoteRowsValue>(() => {
    const map = new Map<string, DebateClaim>();
    for (const claim of claims) map.set(voteRowKey(claim.space_id, claim.claim_entity_id), claim);
    return {
      rowFor: target => map.get(voteRowKey(target.spaceId, target.claimId)) ?? null,
      batchStatusFor: target => status[target.spaceId] ?? 'pending',
    };
  }, [claims, status]);

  return (
    <TemplateVoteRowsContext.Provider value={value}>
      {batches}
      {children}
    </TemplateVoteRowsContext.Provider>
  );
}

/**
 * Draws a row's pills from its saved vote when it has a target, else from its local handlers.
 * `children` gets null when the row has neither, and should then draw nothing. Inside
 * `TemplateVoteRows` the row comes from the list's lookup; outside it, the row looks itself up.
 */
export function ClaimVoteBinding({
  voteTarget,
  userVote,
  agreeCount,
  disagreeCount,
  onVote,
  onClearVote,
  children,
}: {
  voteTarget?: ClaimVoteTarget;
  userVote?: VoteChoice;
  agreeCount?: number;
  disagreeCount?: number;
  onVote?: (choice: Side) => void;
  onClearVote?: () => void;
  children: (vote: TemplateVoteBinding | null) => React.ReactNode;
}) {
  const list = React.useContext(TemplateVoteRowsContext);
  if (voteTarget) {
    const vote = (
      <TemplateClaimVote
        target={voteTarget}
        agreeCount={agreeCount}
        disagreeCount={disagreeCount}
        row={list ? list.rowFor(voteTarget) : undefined}
      >
        {children}
      </TemplateClaimVote>
    );
    return list ? <ClaimBatchRow status={list.batchStatusFor(voteTarget)}>{vote}</ClaimBatchRow> : vote;
  }
  return <>{children(localVoteBinding({ userVote, agreeCount, disagreeCount, onVote, onClearVote }))}</>;
}

/**
 * The Agree / Disagree pair a claim list row draws from its binding: the debates app's buttons
 * (GEO-3845, see `debate-vote-buttons.tsx`). It spans the row on phones and keeps two natural-width
 * buttons in a wide (760px+) row. The counts live in the row's result, as in the app, so the buttons
 * carry none.
 */
export function ClaimVotePills({ title, vote }: { title: string; vote: TemplateVoteBinding }) {
  return (
    <span className="flex w-full flex-col gap-1 @[760px]:w-auto @[760px]:shrink-0">
      <DebateVoteButtons
        userVote={vote.userVote}
        disabled={vote.disabled}
        compact
        label={`Vote on ${title}`}
        titleFor={vote.titleFor}
        onPress={vote.press}
        className="w-full"
        buttonClassName="flex-1 basis-0 @[760px]:min-w-[112px] @[760px]:flex-none"
        // Phones stretch the pair across the row with the app's 4px padding, so "Disagree" fits at 320px;
        // wide rows give both buttons one width, as the app's pair.
        buttonPaddingClassName="px-1 @[760px]:px-3.5"
      />
      {vote.error && (
        <span role="alert" className="text-[12.5px] text-red-01">
          {vote.error}
        </span>
      )}
    </span>
  );
}
