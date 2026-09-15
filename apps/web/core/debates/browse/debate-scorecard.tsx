'use client';

import * as React from 'react';

import cx from 'classnames';

import { useClaimResponseState } from '~/core/claims/browse/use-claim-response-state';
import type { Debate, DebateClaim, DebateParticipant } from '~/core/debates/api';
import { type TimedClaim, formatTimecode } from '~/core/debates/claim-timing';
import { PositionRow, useClaimPositionControl } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { orderedParticipants, speakerLabel } from '~/core/debates/playback-utils';
import type { DebateVotesResult } from '~/core/debates/use-debate-votes';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import type { Entity } from '~/core/types';

import { Avatar } from '~/design-system/avatar';
import { Text } from '~/design-system/text';

import type { DebateTicker } from './debate-claim-ticker';
import { Crown } from './icons';

/** How long a freshly taken side stays on screen before the card moves on. */
const ADVANCE_DELAY_MS = 700;

/**
 * The ask, once the video has stopped, and then the scorecard it adds up to.
 *
 * Taking a position on a claim is what this whole feature is for, and this is where it gets asked
 * properly: the video is done, nothing is moving, and one claim at a time gets the claim card's own
 * pills rather than anything improvised. When the claims run out it turns into a read of how the
 * viewer landed, and finishes on the debate's own question.
 */
export function DebateScorecard({
  debate,
  ticker,
  votes,
  onReplay,
}: {
  debate: Debate;
  ticker: DebateTicker;
  votes: DebateVotesResult;
  onReplay: () => void;
}) {
  const { claims, answers, rowsByClaimId, entitiesByClaimId, speakerByClaimId, onAnswered } = ticker;

  const [skipped, setSkipped] = React.useState<ReadonlySet<string>>(() => new Set());

  const answerable = React.useMemo(() => claims.filter(claim => claim.spaceId !== null), [claims]);

  /**
   * Sides the viewer already held before this sitting, read off the rows the hook already batched.
   *
   * Without this a rewatch walked the whole card: each claim mounted, found a response already
   * published, and advanced — so thirteen answered claims flicked past one by one before the
   * summary appeared. Knowing up front means they are never queued in the first place.
   */
  const priorAnswers = React.useMemo(() => {
    const map = new Map<string, boolean>();
    for (const claim of answerable) {
      const response = rowsByClaimId.get(claim.id)?.viewer_response;
      if (response) map.set(claim.id, response.position);
    }
    return map;
  }, [answerable, rowsByClaimId]);

  // This sitting's answers win: the viewer may have just changed their mind about one.
  const allAnswers = React.useMemo(() => {
    const merged = new Map(priorAnswers);
    for (const [claimId, position] of answers) merged.set(claimId, position);
    return merged;
  }, [priorAnswers, answers]);

  const remaining = React.useMemo(
    () => answerable.filter(claim => !allAnswers.has(claim.id) && !skipped.has(claim.id)),
    [answerable, allAnswers, skipped]
  );

  const skip = React.useCallback((claimId: string) => {
    setSkipped(current => new Set(current).add(claimId));
  }, []);

  const lean = useDebateLean(debate, claims, allAnswers, speakerByClaimId);

  // A debate with no claims has nothing to ask about, and the card would be an empty frame over
  // the replay button.
  if (answerable.length === 0) return null;

  const next = remaining[0] ?? null;

  return (
    <div className="pointer-events-auto w-full max-w-[24rem] overflow-hidden rounded-lg bg-white shadow-card">
      <header className="flex items-start justify-between gap-3 border-b border-divider px-4 py-3">
        <div className="min-w-0">
          <Text as="p" variant="smallTitle" color="text">
            {next ? 'Where do you stand?' : 'Your scorecard'}
          </Text>
          <Text as="p" variant="footnote" color="grey-04" className="mt-0.5 tabular-nums">
            {next
              ? `${answerable.length} claims were made · ${allAnswers.size} answered`
              : `You answered ${allAnswers.size} of ${answerable.length}`}
          </Text>
        </div>
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            onReplay();
          }}
          className="shrink-0 text-metadata text-grey-04 transition-colors hover:text-text"
        >
          Watch again
        </button>
      </header>

      {next ? (
        <ScorecardClaim
          key={next.id}
          claim={next}
          speaker={speakerByClaimId.get(next.id) ?? null}
          row={rowsByClaimId.get(next.id) ?? null}
          entity={entitiesByClaimId.get(next.id) ?? null}
          onAnswered={onAnswered}
          onSkip={skip}
        />
      ) : (
        <DebateLean lean={lean} votes={votes} />
      )}
    </div>
  );
}

export type SpeakerLean = {
  participant: DebateParticipant;
  label: string;
  agreed: number;
  answered: number;
  /** Share of this debater's answered claims the viewer agreed with, 0–1, or null if none. */
  rate: number | null;
};

/**
 * How the viewer's answers fell across the two debaters.
 *
 * Counted against the claims they actually answered, not everything that debater said: "5 of 7"
 * out of seven answered is a lean, while the same five against a dozen they skipped would read as
 * disagreement they never expressed.
 */
function useDebateLean(
  debate: Debate,
  claims: TimedClaim[],
  answers: ReadonlyMap<string, boolean>,
  speakerByClaimId: Map<string, string>
): SpeakerLean[] {
  return React.useMemo(() => {
    const byLabel = new Map<string, SpeakerLean>();
    for (const participant of orderedParticipants(debate)) {
      const label = speakerLabel(participant);
      byLabel.set(label, { participant, label, agreed: 0, answered: 0, rate: null });
    }

    for (const claim of claims) {
      const position = answers.get(claim.id);
      if (position === undefined) continue;
      const entry = byLabel.get(speakerByClaimId.get(claim.id) ?? '');
      if (!entry) continue;
      entry.answered += 1;
      if (position) entry.agreed += 1;
    }

    for (const entry of byLabel.values()) {
      entry.rate = entry.answered === 0 ? null : entry.agreed / entry.answered;
    }

    return [...byLabel.values()];
  }, [debate, claims, answers, speakerByClaimId]);
}

/**
 * Which way the viewer leaned, in words.
 *
 * By rate rather than by count. Agreeing with 7 of 7 and 6 of 6 is agreeing with both of them, and
 * calling that a lean towards the one who happened to make one more claim is just reporting who
 * talked more.
 */
export function leanHeadline(lean: SpeakerLean[]): string {
  const answered = lean.filter(entry => entry.rate !== null);
  if (answered.length === 0) return 'You skipped every claim';
  if (answered.length === 1) return `You only answered ${answered[0].label}'s claims`;

  const [first, second] = [...answered].sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));
  // Rounded to whole percent, which is what the bars show — a hair of float difference is not a
  // lean the reader can see.
  if (Math.round((first.rate ?? 0) * 100) === Math.round((second.rate ?? 0) * 100)) {
    if ((first.rate ?? 0) === 0) return 'You disagreed with both of them';
    if ((first.rate ?? 0) === 1) return 'You agreed with both of them';
    return 'You split evenly between them';
  }

  return `You sided with ${first.label} more often`;
}

/**
 * The scorecard: how each debater's claims landed with this viewer, then the winner vote.
 *
 * One block per debater, and their vote button lives inside their own block. As two bare pills in a
 * row there was nothing tying a percentage to a person — the pill drops the name once voted,
 * because on the tiles it sits on that debater's own face and does not need it.
 */
function DebateLean({ lean, votes }: { lean: SpeakerLean[]; votes: DebateVotesResult }) {
  return (
    <div className="px-4 py-3.5">
      <Text as="p" variant="metadataMedium" color="text">
        {leanHeadline(lean)}
      </Text>

      <div className="mt-3 flex flex-col gap-3.5">
        {lean.map(entry => (
          <ScorecardRow key={entry.label} entry={entry} votes={votes} />
        ))}
      </div>
    </div>
  );
}

function ScorecardRow({ entry, votes }: { entry: SpeakerLean; votes: DebateVotesResult }) {
  const disagreed = entry.answered - entry.agreed;
  const sharePercent = votes.sharePercentFor(entry.participant);
  const isMyPick = votes.isMyPick(entry.participant);

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="block size-5 shrink-0 overflow-hidden rounded-full bg-grey-02">
          <Avatar avatarUrl={entry.participant.avatar_cid} value={entry.participant.profile_space_id} size={20} />
        </span>
        <Text as="span" variant="metadataMedium" color="text" className="min-w-0 truncate">
          {entry.label}
        </Text>
        <Text as="span" variant="footnote" color="grey-04" className="ml-auto shrink-0 tabular-nums">
          {entry.answered === 0 ? 'not answered' : `${entry.agreed} of ${entry.answered} agreed`}
        </Text>
      </div>

      <AgreementBar agreed={entry.agreed} disagreed={disagreed} />

      <WinnerChoice
        label={entry.label}
        avatarUrl={entry.participant.avatar_cid}
        avatarValue={entry.participant.profile_space_id}
        sharePercent={sharePercent}
        isMyPick={isMyPick}
        disabled={votes.isVoting}
        onVote={() => votes.castVote(entry.participant)}
      />
    </div>
  );
}

/**
 * Agreed against disagreed, for one debater.
 *
 * Two segments with a gap between them rather than one continuous bar: the gap is what stops the
 * green reading as a fill level on a red track. An unanswered debater gets an empty track rather
 * than a zero-width bar, so the row still has a shape.
 */
function AgreementBar({ agreed, disagreed }: { agreed: number; disagreed: number }) {
  const total = agreed + disagreed;

  if (total === 0) {
    return <div className="mt-1.5 h-1.5 rounded-full bg-grey-01" />;
  }

  return (
    <div className="mt-1.5 flex h-1.5 gap-0.5" role="presentation">
      {agreed > 0 && <span className="rounded-full bg-green" style={{ flexGrow: agreed }} />}
      {disagreed > 0 && <span className="rounded-full bg-red-01" style={{ flexGrow: disagreed }} />}
    </div>
  );
}

/**
 * The winner vote, carrying the debater it votes for.
 *
 * Not `WinnerVoteButton`, which drops the name the moment a vote lands — correct on a tile, where
 * the pill sits on that debater's own face, and unreadable here, where two of them sit in a card.
 * Behaviour is the shared hook's either way, so a vote cast here shows on the tiles too.
 */
function WinnerChoice({
  label,
  avatarUrl,
  avatarValue,
  sharePercent,
  isMyPick,
  disabled,
  onVote,
}: {
  label: string;
  avatarUrl: string | null | undefined;
  avatarValue: string | undefined;
  sharePercent: number | null;
  isMyPick: boolean;
  disabled: boolean;
  onVote: () => void;
}) {
  const hasVoted = sharePercent !== null;

  return (
    <button
      type="button"
      disabled={disabled || isMyPick}
      aria-pressed={isMyPick}
      aria-label={`Vote ${label} as the winner`}
      onClick={event => {
        event.stopPropagation();
        onVote();
      }}
      className={cx(
        'mt-2 flex w-full items-center gap-1.5 rounded-full px-2.5 py-1.5 text-metadata leading-none transition-colors disabled:cursor-default',
        isMyPick ? 'bg-[#9A4EFF] text-white' : 'bg-grey-01 text-grey-04 hover:bg-grey-02 hover:text-text'
      )}
    >
      <span className="block size-4 shrink-0 overflow-hidden rounded-full bg-white/30">
        <Avatar avatarUrl={avatarUrl} value={avatarValue} size={16} />
      </span>
      <span className="min-w-0 truncate">{isMyPick ? `${label} won it` : label}</span>
      <span className="ml-auto flex shrink-0 items-center gap-1 tabular-nums">
        <Crown />
        {hasVoted ? `${sharePercent}%` : 'Winner?'}
      </span>
    </button>
  );
}

/**
 * One claim, with both sides spelled out.
 *
 * The claim card's own pills, not a lookalike: this is the same question the explore feed, the hub
 * and the claims panel ask, and there is room here for the full control.
 */
function ScorecardClaim({
  claim,
  speaker,
  row,
  entity,
  onAnswered,
  onSkip,
}: {
  claim: TimedClaim;
  speaker: string | null;
  row: DebateClaim | null;
  entity: Entity | null;
  onAnswered: (claimId: string, position: boolean) => void;
  onSkip: (claimId: string) => void;
}) {
  const promptSignIn = usePrivySignIn();
  // Narrowed by the caller, which only passes claims that have a space to publish into.
  const spaceId = claim.spaceId as string;
  const {
    responseKind,
    isResponseKindResolved,
    isViewerResponseResolved,
    responseBlockedReason,
    claim: claimSummary,
    positions,
    readiness,
  } = useClaimResponseState({ claimId: claim.id, spaceId, row, entity });

  const control = useClaimPositionControl({
    claim: claimSummary,
    positions,
    readiness,
    answersReady: isResponseKindResolved && isViewerResponseResolved,
    responseBlockedReason,
    onRequireSignIn: promptSignIn,
    offersDebate: false,
  });

  const position = control.viewerPosition;

  /**
   * Whether this card was already answered when it mounted.
   *
   * The caller filters those out using the rows it batched, but that only covers spaces geo-chat
   * indexes — elsewhere the answer only turns up once this component asks. Such a claim is reported
   * immediately rather than after the hold: the hold exists so a fresh press is seen landing, and
   * there is nothing to see on one answered weeks ago.
   */
  const wasAnsweredOnMount = React.useRef<boolean | null>(null);
  if (wasAnsweredOnMount.current === null && isViewerResponseResolved) {
    wasAnsweredOnMount.current = position !== null;
  }

  const reported = React.useRef(false);
  React.useEffect(() => {
    if (position === null || reported.current) return;
    reported.current = true;

    if (wasAnsweredOnMount.current) {
      onAnswered(claim.id, position);
      return;
    }

    const timer = setTimeout(() => onAnswered(claim.id, position), ADVANCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [position, claim.id, onAnswered]);

  return (
    <div className="px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <Text as="p" variant="footnote" color="grey-04" className="min-w-0 truncate">
          {speaker ? `${speaker} said` : 'Said'}
          {claim.timing ? ` at ${formatTimecode(claim.timing.startMs)}` : null}
        </Text>
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            onSkip(claim.id);
          }}
          className="shrink-0 text-metadata text-grey-04 transition-colors hover:text-text"
        >
          Skip
        </button>
      </div>
      <Text as="p" variant="metadataMedium" color="text" className="mt-1.5 leading-snug">
        {claim.text}
      </Text>

      <div className="mt-3">
        <PositionRow
          positions={control.optimisticPositions}
          responseKind={responseKind}
          viewerPosition={control.viewerPosition}
          onRespond={control.respond}
          disabled={!control.canRespond}
          titleFor={control.actionTitle}
        />
      </div>

      {control.responseError ? (
        <div role="alert" className="mt-2">
          <Text as="p" variant="footnote" color="red-01">
            {control.responseError}
          </Text>
        </div>
      ) : null}
    </div>
  );
}
