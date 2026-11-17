'use client';

import * as React from 'react';

import cx from 'classnames';

import { Spinner } from '~/design-system/spinner';
import { Text } from '~/design-system/text';

import type { DebateMediaTurnSegment, ParticipantSlot } from '../api';
import { WAITING_TEXT_CLASS } from '../matchmaking/admin-debate-parts';
import { recordingSpanOf } from '../recording-clock';
import type { StoryReelMoment } from './api';
import { PILL_CLASS, WarnIcon } from './editor-ui';
import { type EditorClip, formatReelTime, formatSeconds } from './reel';
import type { ReelJob } from './reel-status';
import { SPEAKER_CHIP_CLASS } from './speaker-classes';

/**
 * What a preview says would be published (GEO-3671): the media worker runs the reel exactly as a
 * publish would, writes nothing, and reports each clip as it would cut it. Its cuts are on the
 * rendered video's clock and shown here on the player's, like everything else in the editor.
 */
export function ReelPreviewPanel({
  job,
  stale,
  turns,
  clips,
  flagged,
  nameOf,
  onCheckAgain,
}: {
  /** The preview this visit queued, or `null` before there is one. */
  job: ReelJob | null;
  /** The reel was edited after the preview was queued. */
  stale: boolean;
  turns: readonly DebateMediaTurnSegment[];
  /** The reel as the preview was sent, in that order: what its moments are matched to. */
  clips: readonly EditorClip[];
  /** The clips a failed preview flagged, as the reel numbers them now. */
  flagged: readonly number[];
  nameOf: (slot: ParticipantSlot | null) => string | null;
  /** "Check again", once the reel was edited since this check. */
  onCheckAgain: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 text-[14px] leading-[18px]">
      <PreviewBody
        job={job}
        stale={stale}
        turns={turns}
        clips={clips}
        flagged={flagged}
        nameOf={nameOf}
        onCheckAgain={onCheckAgain}
      />
    </div>
  );
}

function PreviewBody({
  job,
  stale,
  turns,
  clips,
  flagged,
  nameOf,
  onCheckAgain,
}: {
  job: ReelJob | null;
  stale: boolean;
  turns: readonly DebateMediaTurnSegment[];
  clips: readonly EditorClip[];
  flagged: readonly number[];
  nameOf: (slot: ParticipantSlot | null) => string | null;
  onCheckAgain: () => void;
}) {
  const staleNote = stale ? (
    <div className="flex items-center gap-2.5 rounded-lg bg-grey-01 py-2 pr-2 pl-3">
      <span className="flex-1 text-metadata">You’ve edited the reel since this check.</span>
      <button type="button" className={PILL_CLASS} onClick={onCheckAgain}>
        Check again
      </button>
    </div>
  ) : null;
  if (!job || job.kind === 'none') {
    return (
      <Text as="p" variant="metadata" color="grey-04">
        Preview sends the reel to the media worker, which checks every clip against the recordings and reports exactly
        what it would publish: the cuts, the speaker, the linked claim and the words. Nothing goes live.
      </Text>
    );
  }
  if (job.kind === 'queued' || job.kind === 'rendering') {
    return (
      <span className="inline-flex items-center gap-2">
        <Spinner />
        <Text variant="metadata" color="grey-04">
          {job.kind === 'queued'
            ? 'Preview queued. It runs when the media worker gets to it.'
            : 'The media worker is checking the clips…'}
        </Text>
      </span>
    );
  }
  if (job.kind === 'failed') {
    return (
      <>
        <div role="alert" className="flex items-start gap-2.5 rounded-lg bg-red-02 py-2 pr-2 pl-3 text-metadata">
          <WarnIcon className="mt-0.5 text-red-01" />
          <span className="flex-1">
            <b className="font-medium">This reel would not publish.</b> {job.summary}
            {flagged.length > 0 ? ` See clip${flagged.length > 1 ? 's' : ''} ${flagged.join(', ')}.` : ''}
            {job.other.map(problem => (
              <span key={problem} className="mt-1 block">
                {problem}
              </span>
            ))}
          </span>
        </div>
        {staleNote}
      </>
    );
  }
  const moments = job.report?.story_reel ?? [];
  return (
    <>
      {staleNote}
      {moments.length === 0 ? (
        <Text as="p" variant="metadata" color="grey-04">
          The preview finished but listed no clips.
        </Text>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {moments.map((moment, index) => (
            <PreviewClip
              key={`${moment.moment_index}-${moment.cut_start_ms}`}
              index={index}
              moment={moment}
              turns={turns}
              pickedClaim={clips[index]?.claim_index ?? null}
              nameOf={nameOf}
            />
          ))}
        </ol>
      )}
    </>
  );
}

function PreviewClip({
  index,
  moment,
  turns,
  pickedClaim,
  nameOf,
}: {
  index: number;
  moment: StoryReelMoment;
  turns: readonly DebateMediaTurnSegment[];
  pickedClaim: number | null;
  nameOf: (slot: ParticipantSlot | null) => string | null;
}) {
  const cut = recordingSpanOf(moment.cut_start_ms, moment.cut_end_ms, turns);
  const slot = moment.participant_slot === 1 || moment.participant_slot === 2 ? moment.participant_slot : null;
  // The admin picked a claim, and the worker linked another: dedup can move a claim's position.
  const claimMoved = pickedClaim !== null && pickedClaim !== moment.claim_index;
  return (
    <li className="grid grid-cols-[20px_minmax(0,1fr)] gap-2 border-t border-divider pt-3 first:border-t-0 first:pt-0">
      <span
        className={cx(
          'grid h-5 w-5 place-items-center rounded-sm text-breadcrumb leading-none font-medium tabular-nums',
          slot ? SPEAKER_CHIP_CLASS[slot] : 'bg-grey-01 text-grey-04'
        )}
        aria-hidden
      >
        {index + 1}
      </span>
      <div className="min-w-0">
        <p className="font-medium">
          {nameOf(slot) ?? 'No speaker'}{' '}
          <span className="font-normal text-grey-04 tabular-nums">
            · {formatReelTime(cut.start_ms)}–{formatReelTime(cut.end_ms)} · {formatSeconds(cut.end_ms - cut.start_ms)}
          </span>
        </p>
        <p className="mt-1 text-grey-04">
          Claim:{' '}
          <span className="text-text">{moment.claim_text ? `“${moment.claim_text}”` : `#${moment.claim_index}`}</span>
        </p>
        {claimMoved ? (
          <p className={cx('mt-1', WAITING_TEXT_CLASS)}>
            This isn&apos;t the claim you picked. Check it before publishing.
          </p>
        ) : null}
        <p className="mt-1 text-grey-05">{moment.quote}</p>
      </div>
    </li>
  );
}
