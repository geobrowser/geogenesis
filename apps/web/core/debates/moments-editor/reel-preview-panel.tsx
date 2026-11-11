'use client';

import * as React from 'react';

import cx from 'classnames';

import { Spinner } from '~/design-system/spinner';
import { Text } from '~/design-system/text';

import type { DebateMediaTurnSegment, ParticipantSlot } from '../api';
import { NEGATIVE_TEXT_CLASS, WAITING_TEXT_CLASS } from '../matchmaking/admin-debate-parts';
import { recordingSpanOf } from '../recording-clock';
import type { StoryReelMoment } from './api';
import { SPEAKER_FILL_CLASS } from './clip-row';
import { type EditorClip, formatReelTime, formatSeconds } from './reel';
import type { ReelJob } from './reel-status';

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
  nameOf,
}: {
  /** The preview this visit queued, or `null` before there is one. */
  job: ReelJob | null;
  /** The reel was edited after the preview was queued. */
  stale: boolean;
  turns: readonly DebateMediaTurnSegment[];
  /** The reel as the preview was sent, in that order: what its moments are matched to. */
  clips: readonly EditorClip[];
  nameOf: (slot: ParticipantSlot | null) => string | null;
}) {
  return (
    <section className="rounded border border-grey-02 bg-white">
      <div className="border-b border-divider p-3">
        <Text as="h2" variant="smallTitle">
          Preview
        </Text>
      </div>
      <div className="flex flex-col gap-3 p-3 text-[14px] leading-[18px]">
        <PreviewBody job={job} stale={stale} turns={turns} clips={clips} nameOf={nameOf} />
      </div>
    </section>
  );
}

function PreviewBody({
  job,
  stale,
  turns,
  clips,
  nameOf,
}: {
  job: ReelJob | null;
  stale: boolean;
  turns: readonly DebateMediaTurnSegment[];
  clips: readonly EditorClip[];
  nameOf: (slot: ParticipantSlot | null) => string | null;
}) {
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
    const flagged = Object.keys(job.clips).map(index => Number(index) + 1);
    return (
      <div className={NEGATIVE_TEXT_CLASS}>
        <p>
          <b className="font-medium">This reel would not publish.</b> {job.summary}
          {flagged.length > 0 ? ` See clip${flagged.length > 1 ? 's' : ''} ${flagged.join(', ')}.` : ''}
        </p>
        {job.other.map(problem => (
          <p key={problem} className="mt-1">
            {problem}
          </p>
        ))}
      </div>
    );
  }
  const moments = job.report?.story_reel ?? [];
  return (
    <>
      {stale ? (
        <p className={WAITING_TEXT_CLASS}>You&apos;ve edited the reel since this preview. Preview again to check it.</p>
      ) : null}
      {moments.length === 0 ? (
        <Text as="p" variant="metadata" color="grey-04">
          The preview finished but listed no clips.
        </Text>
      ) : (
        <ol className="flex flex-col gap-3">
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
          'grid h-5 w-5 place-items-center rounded-full text-[12px] font-semibold text-white',
          slot ? SPEAKER_FILL_CLASS[slot] : 'bg-grey-03'
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
