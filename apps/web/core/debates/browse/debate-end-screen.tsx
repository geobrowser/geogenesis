'use client';

import * as React from 'react';

import cx from 'classnames';
import { useRouter } from 'next/navigation';

import { ActionSurface, useActionContext } from '~/core/action-context-provider';
import { recordAction } from '~/core/analytics-operations';
import type { Debate, DebateParticipant } from '~/core/debates/api';
import { participantForSlot, speakerLabel } from '~/core/debates/playback-utils';
import { useDebateVotes } from '~/core/debates/use-debate-votes';
import { responsePositionLabel } from '~/core/responses/entity-response';
import { NavUtils } from '~/core/utils/utils';

import { GeoImage } from '~/design-system/geo-image';
import { RetrySmall } from '~/design-system/icons/retry-small';

import { STAGE_PRIMARY_BUTTON, STAGE_SECONDARY_BUTTON, STAGE_TEXT_LINK } from './debate-stage-panel';
import { PILL_ACTION_CLASS } from './pill-action';
import type { DebateStage } from './use-debate-stage';
import { type NextDebate, useNextDebates } from './use-next-debate';

/** How long "Play next" takes to fill before the highlighted debate starts on its own. */
export const AUTOPLAY_NEXT_MS = 10_000;
/** The fill advances in steps this long; short enough to read as continuous. */
const AUTOPLAY_TICK_MS = 100;
/** How many debates the screen offers to watch next. */
export const NEXT_DEBATE_COUNT = 3;

/** The winner pill's purple, from `winner-vote-button.tsx` — the Figma fill, not the `purple` token. */
const PICKED_PURPLE = 'bg-[#9A4EFF]';

/**
 * Where a debate in the full-screen view ends: one screen, and nothing on it waits for the viewer.
 *
 * "Who won?" sits at the top and answers in place. The next debates sit under it, and "Play next" is
 * itself the countdown — it fills over ten seconds and plays the highlighted debate when full, like a
 * streaming service's next-episode button. Tapping it skips the wait; touching anything else on the
 * screen holds the fill until the pointer leaves; "Pause autoplay" stops it.
 *
 * Built on the end card's own shell — the white card over the dimmed last frame — and its controls:
 * the winner vote is `useDebateVotes`, the debates are `pickNextDebates`.
 */
export function DebateEndScreen({
  debate,
  stage,
  onReplay,
}: {
  debate: Debate;
  stage: DebateStage;
  onReplay: () => void;
}) {
  const router = useRouter();
  const votes = useDebateVotes(debate);
  const next = useNextDebates(debate, true, NEXT_DEBATE_COUNT);
  const getContext = useActionContext('debate_end_screen', 'debate', debate.id, { debate_id: debate.id });

  const participants = React.useMemo(
    () =>
      [participantForSlot(debate, 1), participantForSlot(debate, 2)].filter((p): p is DebateParticipant => p !== null),
    [debate]
  );

  const [selected, setSelected] = React.useState(0);
  const [interacting, setInteracting] = React.useState(false);
  const [autoplayStopped, setAutoplayStopped] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const navigatedRef = React.useRef(false);

  const playNext = React.useCallback(
    (target: NextDebate, trigger: 'autoplay' | 'play_next_tap' | 'card_tap', slot: number) => {
      if (navigatedRef.current) return;
      navigatedRef.current = true;
      try {
        recordAction('play_next', getContext(), { trigger, slot, to_debate_id: target.debateId });
      } catch {
        /* Navigation must work without analytics. */
      }
      router.push(NavUtils.toEntity(target.spaceId, target.debateId));
    },
    [getContext, router]
  );

  const counting = next.length > 0 && !autoplayStopped && !interacting;
  React.useEffect(() => {
    if (!counting) return;
    const timer = setInterval(
      () => setElapsed(current => Math.min(AUTOPLAY_NEXT_MS, current + AUTOPLAY_TICK_MS)),
      AUTOPLAY_TICK_MS
    );
    return () => clearInterval(timer);
  }, [counting]);

  const target = next[Math.min(selected, next.length - 1)];
  const autoplayNow = React.useEffectEvent(() => {
    if (target) playNext(target, 'autoplay', Math.min(selected, next.length - 1) + 1);
  });
  React.useEffect(() => {
    if (elapsed >= AUTOPLAY_NEXT_MS) autoplayNow();
  }, [elapsed]);

  const progress = autoplayStopped ? 0 : elapsed / AUTOPLAY_NEXT_MS;

  return (
    <ActionSurface
      className="contents"
      trackImpression
      value={{ component: 'debate_end_screen', target_id: debate.id, target_type: 'debate' }}
    >
      <div data-debate-end-screen className="absolute inset-0 z-40">
        <div aria-hidden className="absolute inset-0 bg-black/55" />
        <section
          aria-label="Debate over"
          onPointerEnter={() => setInteracting(true)}
          onPointerLeave={() => setInteracting(false)}
          onFocus={() => setInteracting(true)}
          onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setInteracting(false);
          }}
          className="absolute inset-x-4 top-4 flex max-h-[calc(100%-2rem)] flex-col gap-4 overflow-y-auto overscroll-contain rounded-xl bg-white p-5 text-text shadow-card @max-md:inset-x-2 @max-md:top-2 @max-md:max-h-[calc(100%-1rem)] @max-md:gap-3 @max-md:rounded-lg @max-md:p-3.5"
        >
          {participants.length === 2 ? (
            <WinnerSection participants={participants} votes={votes} stage={stage} onReplay={onReplay} />
          ) : (
            <div className="flex justify-end">
              <ReplayPill onReplay={onReplay} />
            </div>
          )}

          {next.length > 0 ? (
            <section aria-label="Up next" className="flex flex-col gap-2 border-t border-divider pt-3">
              <span className="text-metadata text-grey-04">Up next</span>
              <div className="grid grid-cols-3 gap-2">
                {next.map((candidate, index) => (
                  <NextDebateCard
                    key={candidate.debateId}
                    next={candidate}
                    highlighted={index === Math.min(selected, next.length - 1)}
                    onPlay={() => {
                      setSelected(index);
                      playNext(candidate, 'card_tap', index + 1);
                    }}
                  />
                ))}
              </div>
              <div className="mt-1 grid grid-cols-[1.4fr_1fr] gap-2">
                <button
                  type="button"
                  onClick={() => target && playNext(target, 'play_next_tap', Math.min(selected, next.length - 1) + 1)}
                  className={cx(STAGE_PRIMARY_BUTTON, 'relative overflow-hidden')}
                >
                  {/* The countdown, in the button: the fill sweeps across it and the debate plays when full. */}
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 bg-white/25 transition-[width] duration-100 ease-linear"
                    style={{ width: `${progress * 100}%` }}
                  />
                  <span className="relative">▶ Play next</span>
                </button>
                <button
                  type="button"
                  disabled={autoplayStopped}
                  onClick={() => {
                    setAutoplayStopped(true);
                    setElapsed(0);
                  }}
                  data-geo-analytics-label="debate_pause_autoplay"
                  data-geo-analytics-intent="pause_autoplay"
                  className={STAGE_SECONDARY_BUTTON}
                >
                  {autoplayStopped ? 'Autoplay paused' : 'Pause autoplay'}
                </button>
              </div>
            </section>
          ) : null}
        </section>
      </div>
    </ActionSurface>
  );
}

function ReplayPill({ onReplay }: { onReplay: () => void }) {
  return (
    <button
      type="button"
      aria-label="Replay debate"
      data-end-card-replay
      onClick={onReplay}
      className={cx(PILL_ACTION_CLASS, 'shrink-0 gap-1 px-2.5 text-smallButton')}
    >
      <RetrySmall />
      Replay
    </button>
  );
}

/**
 * "Who won?", answered in place, and the one-tap switch when the pick argued the other side.
 *
 * The result bar mirrors the buttons: the left debater's share fills from the left and the right's
 * from the right, so each number sits under the name it belongs to.
 */
function WinnerSection({
  participants,
  votes,
  stage,
  onReplay,
}: {
  participants: DebateParticipant[];
  votes: ReturnType<typeof useDebateVotes>;
  stage: DebateStage;
  onReplay: () => void;
}) {
  const [left, right] = participants;
  const picked = participants.find(participant => votes.isMyPick(participant)) ?? null;
  const leftShare = votes.sharePercentFor(left);
  const rightShare = votes.sharePercentFor(right);

  // Remembered so the switch can be undone in place.
  const [switchedFrom, setSwitchedFrom] = React.useState<boolean | null>(null);
  const stance = stage.stance;

  return (
    <section aria-label="Who won?" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-mediumTitle text-text">Who won?</h3>
        <ReplayPill onReplay={onReplay} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {participants.map(participant => {
          const mine = votes.isMyPick(participant);
          return (
            <button
              key={participant.participant_slot}
              type="button"
              aria-pressed={mine}
              disabled={votes.isVoting}
              onClick={() => void votes.castVote(participant)}
              className={cx(
                mine ? cx(STAGE_PRIMARY_BUTTON, PICKED_PURPLE, 'hover:bg-[#9A4EFF]') : STAGE_SECONDARY_BUTTON,
                'min-w-0'
              )}
            >
              <span className="truncate">{speakerLabel(participant)}</span>
              {mine ? <span aria-hidden>✓</span> : null}
            </button>
          );
        })}
      </div>

      {leftShare !== null && rightShare !== null ? (
        <div className="flex flex-col gap-1">
          <div
            className="flex h-1.5 gap-0.5"
            role="img"
            aria-label={`${leftShare}% ${speakerLabel(left)}, ${rightShare}% ${speakerLabel(right)}`}
          >
            <span
              className={cx('block h-full rounded-full', picked === left ? PICKED_PURPLE : 'bg-grey-02')}
              style={{ width: `${leftShare}%` }}
            />
            <span className={cx('block h-full flex-1 rounded-full', picked === right ? PICKED_PURPLE : 'bg-grey-02')} />
          </div>
          <div className="flex justify-between text-metadata text-grey-04 tabular-nums">
            <span className={cx(picked === left && 'text-text')}>
              {speakerLabel(left)} {leftShare}%
            </span>
            <span className={cx(picked === right && 'text-text')}>
              {rightShare}% {speakerLabel(right)}
            </span>
          </div>
        </div>
      ) : null}

      {picked ? (
        <StanceSwitch
          picked={picked}
          stance={stance}
          switchedFrom={switchedFrom}
          onSwitch={() => {
            setSwitchedFrom(stance);
            stage.switchStance(picked.position);
          }}
          onUndo={() => {
            if (switchedFrom === null) return;
            stage.switchStance(switchedFrom);
            setSwitchedFrom(null);
          }}
        />
      ) : null}
    </section>
  );
}

/**
 * One line, only when the pick argued the other position from the viewer's — or, for a viewer who
 * chose "Just watch", a first chance to take a side. Named in the vote's own words, Agree or Disagree.
 */
function StanceSwitch({
  picked,
  stance,
  switchedFrom,
  onSwitch,
  onUndo,
}: {
  picked: DebateParticipant;
  stance: boolean | null;
  switchedFrom: boolean | null;
  onSwitch: () => void;
  onUndo: () => void;
}) {
  const pickedSide = responsePositionLabel(picked.position);
  const name = speakerLabel(picked);

  if (switchedFrom !== null && stance === picked.position) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg bg-grey-01 px-3 py-2 text-metadata">
        <span>✓ You now {pickedSide.toLowerCase()}</span>
        <button type="button" onClick={onUndo} className={cx(STAGE_TEXT_LINK, 'px-0')}>
          Undo
        </button>
      </div>
    );
  }

  if (stance === picked.position) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-grey-01 px-3 py-2">
      <span className="text-metadata text-text">
        {stance === null ? (
          <>
            Side with {name}? They argued <strong className="font-medium">{pickedSide}</strong>.
          </>
        ) : (
          <>
            You {stance ? 'agreed' : 'disagreed'}, but picked {name}, who argued{' '}
            <strong className="font-medium">{pickedSide}</strong>.
          </>
        )}
      </span>
      <button
        type="button"
        onClick={onSwitch}
        className="h-7 shrink-0 rounded-full border border-grey-02 bg-white px-3 text-metadata whitespace-nowrap text-text transition-colors hover:bg-grey-01"
      >
        {stance === null ? pickedSide : `Switch to ${pickedSide}`}
      </button>
    </div>
  );
}

/** A debate to watch next: its key frame and the claim it argues. Tapping plays it at once. */
function NextDebateCard({ next, highlighted, onPlay }: { next: NextDebate; highlighted: boolean; onPlay: () => void }) {
  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label={`Play ${next.claimName}`}
      className="flex min-w-0 flex-col gap-1.5 text-left"
    >
      {/* The key frame's own shape: the media job renders it 540×820, both debaters stacked. */}
      <span
        className={cx(
          // Shorter on a narrow player, so "Play next" stays on screen under the row.
          'relative block aspect-[27/41] w-full overflow-hidden rounded-md bg-grey-02 @max-md:aspect-[4/3]',
          highlighted && 'ring-2 ring-text ring-offset-1'
        )}
      >
        {next.keyFrame ? <GeoImage value={next.keyFrame} alt="" fill sizes="120px" className="object-cover" /> : null}
      </span>
      <span className="line-clamp-2 text-[0.8125rem] leading-[1.0625rem] text-text">{next.claimName}</span>
    </button>
  );
}
