import { type EditorClip, MIN_EDIT_CLIP_MS, type ReelWord, snapEdge } from './reel';

/** Where a free edge lands by default: the nearest tenth of a second. */
export const FREE_STEP_MS = 100;

type Drag = {
  index: number;
  mode: 'start' | 'end' | 'move';
  x0: number;
  start: number;
  end: number;
  pxPerMs: number;
  /**
   * The clip's claim when the drag began, sent with every move: the editor drops a claim while the
   * clip is another debater's, and this gives it back when the drag returns to its speaker.
   */
  claim_index: number | null;
};

/**
 * Where a dragged edge lands: off the middle of any word, outward, so the clip takes whole words
 * (`snapEdge`); free (the fine-tune waveform's), wherever it was let go, to `stepMs`, and cut exactly there.
 */
export function dragEdge(
  ms: number,
  words: readonly ReelWord[],
  edge: 'start' | 'end',
  free: boolean,
  stepMs: number = FREE_STEP_MS
) {
  return free ? Math.round(ms / stepMs) * stepMs : snapEdge(ms, words, edge);
}

/**
 * A clip moved or trimmed by a drag of `deltaMs`, kept inside the debate and at least a second long.
 * Moving keeps the clip's length, then snaps both edges out to whole words (free, neither): an
 * end left mid-word would play that word without its caption.
 */
export function draggedClip(
  drag: Pick<Drag, 'mode' | 'start' | 'end'>,
  deltaMs: number,
  words: readonly ReelWord[],
  durationMs: number,
  free: boolean,
  /** Where a free edge lands: the nearest multiple of this. The waveform panel places to 10 ms. */
  stepMs: number = FREE_STEP_MS
): DraggedSpan {
  if (drag.mode === 'start') {
    const start = Math.min(
      Math.max(0, dragEdge(drag.start + deltaMs, words, 'start', free, stepMs)),
      drag.end - MIN_EDIT_CLIP_MS
    );
    return { start_ms: start, end_ms: drag.end, ...(free && { free_start_ms: start }) };
  }
  if (drag.mode === 'end') {
    const end = Math.max(
      Math.min(durationMs, dragEdge(drag.end + deltaMs, words, 'end', free, stepMs)),
      drag.start + MIN_EDIT_CLIP_MS
    );
    return { start_ms: drag.start, end_ms: end, ...(free && { free_end_ms: end }) };
  }
  const length = drag.end - drag.start;
  const start = Math.max(
    0,
    Math.min(durationMs - length, dragEdge(drag.start + deltaMs, words, 'start', free, stepMs))
  );
  const snappedEnd = free ? start + length : Math.min(durationMs, snapEdge(start + length, words, 'end'));
  const end = Math.max(snappedEnd, start + MIN_EDIT_CLIP_MS);
  return { start_ms: start, end_ms: end, ...(free && { free_start_ms: start, free_end_ms: end }) };
}

/**
 * A dragged clip's edges, and when free, where they were placed: a free edge is cut
 * exactly there, not widened into the quiet beside its words (`manualReel`).
 */
export type DraggedSpan = Pick<EditorClip, 'start_ms' | 'end_ms' | 'free_start_ms' | 'free_end_ms'>;
