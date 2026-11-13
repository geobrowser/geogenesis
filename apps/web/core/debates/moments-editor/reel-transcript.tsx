'use client';

import * as React from 'react';

import cx from 'classnames';

import { SmallButton } from '~/design-system/button';
import { Text } from '~/design-system/text';

import type { DebateTranscriptResponse, ParticipantSlot } from '../api';
import { formatTimecode } from '../claim-timing';
import { transcriptOnRecordings } from '../recording-clock';
import { groupTurns, transcriptSpans } from '../transcript-lines';
import { SPEAKER_EDGE_CLASS, SPEAKER_FILL_CLASS } from './clip-row';
import { type EditorClip, MIN_EDIT_CLIP_MS, formatReelTime } from './reel';

/** A sentence (or, from a transcript served without sentences, a line) on the player's clock. */
export type ReelSentence = { slot: ParticipantSlot; start_ms: number; end_ms: number; text: string };

/** How far a sentence must reach into a clip to count as in it, so a shared edge does not. */
const OVERLAP_MS = 150;

/**
 * The transcript's sentences on the player's clock, in time order: the served `sentences`
 * (GEO-3349), or its lines where it has none. A sentence the render cut is left out.
 */
export function reelSentences(transcript: DebateTranscriptResponse | undefined): ReelSentence[] {
  return transcriptOnRecordings(transcriptSpans(transcript))
    .map(sentence => ({
      slot: sentence.participant_slot,
      start_ms: sentence.start_ms,
      end_ms: sentence.end_ms,
      text: sentence.text,
    }))
    .sort((a, b) => a.start_ms - b.start_ms);
}

export function sentenceInClip(sentence: ReelSentence, clip: Pick<EditorClip, 'start_ms' | 'end_ms'>) {
  return sentence.end_ms > clip.start_ms + OVERLAP_MS && sentence.start_ms < clip.end_ms - OVERLAP_MS;
}

/** The clip with its start moved to `sentence`'s start; its end follows if it would come first. */
export function startClipAt(clip: EditorClip, sentence: ReelSentence): EditorClip {
  const start = sentence.start_ms;
  return { ...clip, start_ms: start, end_ms: clip.end_ms <= start + MIN_EDIT_CLIP_MS ? sentence.end_ms : clip.end_ms };
}

/** The clip with its end moved to `sentence`'s end; its start follows if it would come after. */
export function endClipAt(clip: EditorClip, sentence: ReelSentence): EditorClip {
  const end = sentence.end_ms;
  return {
    ...clip,
    end_ms: end,
    start_ms: clip.start_ms >= end - MIN_EDIT_CLIP_MS ? sentence.start_ms : clip.start_ms,
  };
}

/**
 * The debate's transcript, turn by turn (GEO-3672): which clips each sentence plays in, and from
 * any sentence, start or end the selected clip there, start a new clip there, or play from it.
 */
export function ReelTranscript({
  sentences,
  clips,
  speakers,
  selected,
  readOnly,
  canAddClip,
  nameOf,
  onChangeClip,
  onAddClip,
  onSeek,
}: {
  sentences: readonly ReelSentence[];
  clips: readonly EditorClip[];
  speakers: readonly (1 | 2 | null)[];
  selected: number;
  readOnly: boolean;
  /** Whether a clip can be added: the reel isn't read-only and has room. */
  canAddClip: boolean;
  nameOf: (slot: ParticipantSlot | null) => string | null;
  onChangeClip: (index: number, clip: EditorClip) => void;
  /** Adds a clip starting at `ms`, the editor's own way, and selects it. */
  onAddClip: (ms: number) => void;
  onSeek: (ms: number) => void;
}) {
  const selectedClip = clips[selected];
  const turns = groupTurns(sentences);

  return (
    <section className="rounded border border-grey-02 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-divider p-3">
        <Text as="h2" variant="smallTitle">
          Transcript
        </Text>
        {selectedClip ? (
          <Text as="span" variant="metadata" color="grey-04">
            Clip {selected + 1} selected
          </Text>
        ) : null}
      </div>
      {sentences.length === 0 ? (
        <Text as="p" variant="metadata" color="grey-04" className="p-3">
          No transcript.
        </Text>
      ) : (
        <div className="max-h-[880px] overflow-auto">
          {turns.map(turn => (
            <div key={turn[0].start_ms} className="border-b border-divider px-3 py-2.5 last:border-b-0">
              <div className="mb-1.5 flex items-center gap-1.5 text-[14px] font-medium">
                <span aria-hidden className={cx('h-2 w-2 rounded-full', SPEAKER_FILL_CLASS[turn[0].slot])} />
                {nameOf(turn[0].slot)}
              </div>
              {turn.map(sentence => {
                const inClips = clips.flatMap((clip, index) => (sentenceInClip(sentence, clip) ? [index] : []));
                const firstSpeaker = inClips.length > 0 ? speakers[inClips[0]] : null;
                return (
                  <div
                    key={`${sentence.start_ms}-${sentence.end_ms}`}
                    className={cx(
                      'group grid grid-cols-[48px_minmax(0,1fr)] gap-2 rounded px-1.5 py-1 text-[14px] leading-[18px] tracking-[-0.1px] hover:bg-grey-01',
                      inClips.includes(selected) && 'bg-ctaTertiary',
                      firstSpeaker ? SPEAKER_EDGE_CLASS[firstSpeaker] : null
                    )}
                  >
                    <span className="pt-px font-mono text-[12px] text-grey-04 tabular-nums">
                      {formatTimecode(sentence.start_ms)}
                    </span>
                    <div>
                      {sentence.text}
                      {inClips.map(index => (
                        <span
                          key={index}
                          className={cx(
                            'ml-1.5 rounded-sm px-[5px] py-px text-[11px] leading-[13px] font-medium text-white',
                            speakers[index] ? SPEAKER_FILL_CLASS[speakers[index]!] : 'bg-grey-03'
                          )}
                        >
                          {index + 1}
                        </span>
                      ))}
                      <div className="mt-1 hidden flex-wrap gap-1 group-focus-within:flex group-hover:flex">
                        {selectedClip && !readOnly ? (
                          <>
                            <SmallButton onClick={() => onChangeClip(selected, startClipAt(selectedClip, sentence))}>
                              Start clip {selected + 1} here
                            </SmallButton>
                            <SmallButton onClick={() => onChangeClip(selected, endClipAt(selectedClip, sentence))}>
                              End clip {selected + 1} here
                            </SmallButton>
                          </>
                        ) : null}
                        {canAddClip ? (
                          <SmallButton onClick={() => onAddClip(sentence.start_ms)}>New clip here</SmallButton>
                        ) : null}
                        <SmallButton
                          aria-label={`Play from ${formatReelTime(sentence.start_ms)}`}
                          onClick={() => onSeek(sentence.start_ms)}
                        >
                          ▶
                        </SmallButton>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
