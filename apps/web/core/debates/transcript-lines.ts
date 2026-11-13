import type { DebateTranscriptResponse, DebateTranscriptSpan } from './api';

/**
 * A transcript's lines as served, on whichever clock the caller reads them on (GEO-3728).
 *
 * The served `sentences` (GEO-3349) when there are any, else the Whisper `segments`. Chosen by
 * length, not presence: a transcript made before word timing was kept sends `sentences: []`.
 *
 * Clock-neutral on purpose. The moments editor plays the raw recordings and moves these onto that
 * clock (`transcriptOnRecordings`); the Best debates watch popup plays the rendered video, which
 * the bare `start_ms` / `end_ms` are already on.
 */
export function transcriptSpans(transcript: DebateTranscriptResponse | undefined): DebateTranscriptSpan[] {
  if (transcript?.sentences?.length) return transcript.sentences;
  return transcript?.segments ?? [];
}

/** Consecutive lines by the same speaker, as one turn each, in the order given. */
export function groupTurns<T extends { slot: unknown }>(lines: readonly T[]): T[][] {
  const turns: T[][] = [];
  for (const line of lines) {
    const last = turns.at(-1);
    if (last && last[0].slot === line.slot) last.push(line);
    else turns.push([line]);
  }
  return turns;
}
