'use client';

import * as React from 'react';

import cx from 'classnames';

import { useClaimResponseState } from '~/core/claims/browse/use-claim-response-state';
import type { DebateClaim } from '~/core/debates/api';
import { useDebateClaims, useDebateClaimsBySpaces } from '~/core/debates/hooks';
import { useClaimPositionControl } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { ID } from '~/core/id';
import type { Entity } from '~/core/types';

import { type ClaimVoteTarget, type VoteChoice, formatCompactCount } from '../models';
import { ThumbDownIcon, ThumbUpIcon } from './icons';

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

  // `respond` has no double-press guard of its own: a second press before the bundler has the write
  // would send a retraction. The pills carry the gate, as `ResponseButton` does on master.
  const disabled = !control.canRespond || control.isResponseSubmitting;

  return (
    <>
      {children({
        userVote: liveVote,
        agreeCount: adjustedVoteCount(baseAgree, 'agree', serverVote, liveVote),
        disagreeCount: adjustedVoteCount(baseDisagree, 'disagree', serverVote, liveVote),
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

/** Looks up geo-chat's row for a target; undefined when no list lookup is mounted. */
const TemplateVoteRowsContext = React.createContext<((target: ClaimVoteTarget) => DebateClaim | null) | undefined>(
  undefined
);

/**
 * geo-chat's rows for every voting row in a list, in one lookup per space rather than one per row
 * (the Related claims gallery does the same). Wrap the list in it; each `ClaimVoteBinding` inside
 * reads its row from here instead of looking itself up. With no targets — a fixture, or a list of
 * just-proposed claims — it mounts nothing, so those lists never touch geo-chat.
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
  const rowFor = React.useMemo(() => {
    const map = new Map<string, DebateClaim>();
    for (const claim of claims) map.set(voteRowKey(claim.space_id, claim.claim_entity_id), claim);
    return (target: ClaimVoteTarget) => map.get(voteRowKey(target.spaceId, target.claimId)) ?? null;
  }, [claims]);

  return <TemplateVoteRowsContext.Provider value={rowFor}>{children}</TemplateVoteRowsContext.Provider>;
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
  const rowFor = React.useContext(TemplateVoteRowsContext);
  if (voteTarget) {
    const row = rowFor ? rowFor(voteTarget) : undefined;
    return (
      <TemplateClaimVote target={voteTarget} agreeCount={agreeCount} disagreeCount={disagreeCount} row={row}>
        {children}
      </TemplateClaimVote>
    );
  }
  return <>{children(localVoteBinding({ userVote, agreeCount, disagreeCount, onVote, onClearVote }))}</>;
}

/** The Agree / Disagree pill pair a claim list row draws from its binding. */
export function ClaimVotePills({ title, vote }: { title: string; vote: TemplateVoteBinding }) {
  return (
    <span className="flex shrink-0 flex-col gap-1">
      <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label={`Vote on ${title}`}>
        {(['agree', 'disagree'] as const).map(choice => {
          const pressed = vote.userVote === choice;
          const count = choice === 'agree' ? vote.agreeCount : vote.disagreeCount;
          const Icon = choice === 'agree' ? ThumbUpIcon : ThumbDownIcon;
          return (
            <button
              key={choice}
              type="button"
              aria-pressed={pressed}
              disabled={vote.disabled}
              title={vote.titleFor(choice)}
              onClick={() => vote.press(choice)}
              className={cx(
                'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors disabled:cursor-default disabled:opacity-60',
                pressed ? 'border-text bg-text text-white' : 'border-grey-02 bg-white text-text hover:border-text'
              )}
            >
              <Icon className="size-3.5 shrink-0" />
              <span>{choice === 'agree' ? 'Agree' : 'Disagree'}</span>
              {count !== undefined && count > 0 && (
                <span className={cx('text-[12px] tabular-nums', pressed ? 'text-white/80' : 'text-grey-04')}>
                  {formatCompactCount(count)}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {vote.error && (
        <span role="alert" className="text-[12.5px] text-red-01">
          {vote.error}
        </span>
      )}
    </span>
  );
}
