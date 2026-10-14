import type { DebateMediaResponse, DebateMediaTurnSegment } from './api';

/**
 * The web player's clock, from the rendered video's (GEO-3277).
 *
 * geo-chat publishes every time in a debate's media response — turn segments, breaks, transcript
 * lines, claim times — on the clock of the video it rendered. An Open rounds render edits that
 * video: it cuts each pick window, condenses each break into a short sped-up catch-up (GEO-3276)
 * and cuts the quiet out of an early end. The web player plays neither of those files. It plays the
 * two raw recordings side by side, on the debate's own clock, so every published time after the
 * first edit lands early on it: a turn ends while its speaker is still talking, and the gap grows
 * with each break.
 *
 * This puts a rendered time back on the recordings' clock. Between edits the two run together at
 * normal speed, so only the edits are needed, and the response lists each one with both its
 * rendered and its source position: the breaks, an older render's kept Extend reveals, and the
 * early-end cuts. The render's own metadata records the same mapping per segment; on the debate
 * this was built against, every turn boundary rebuilt from these edits matched it exactly.
 *
 * A fixed format, and any render without edits, has none, and the clock is the identity.
 */

/** One stretch the render edited, on both clocks. A cut has no rendered length. */
type Edit = { outputStartMs: number; outputEndMs: number; sourceStartMs: number; sourceEndMs: number };

/**
 * Which side of an edit a time that falls exactly on one belongs to. A turn that ends where a break
 * begins ended before it (`end`); the turn that starts where a break ends starts after it (`start`).
 */
export type ClockEdge = 'start' | 'end';

export type PlaybackClock = (renderedMs: number, edge?: ClockEdge) => number;

export const identityClock: PlaybackClock = renderedMs => renderedMs;

type EditedMedia = Pick<DebateMediaResponse, 'condensed_breaks' | 'early_end_gaps' | 'round_results'>;

function editsFrom(media: EditedMedia | null | undefined): Edit[] {
  const edits: Edit[] = [
    ...(media?.condensed_breaks ?? []),
    // A condensed render lists each Extend here too, at its condensed position: the same edit.
    ...(media?.round_results ?? []),
  ].map(entry => ({
    outputStartMs: entry.output_start_ms,
    outputEndMs: entry.output_end_ms,
    sourceStartMs: entry.source_start_ms,
    sourceEndMs: entry.source_end_ms,
  }));
  for (const gap of media?.early_end_gaps ?? []) {
    edits.push({
      outputStartMs: gap.output_ms,
      outputEndMs: gap.output_ms,
      sourceStartMs: gap.source_start_ms,
      sourceEndMs: gap.source_end_ms,
    });
  }

  const seen = new Set<string>();
  return edits
    .filter(edit => {
      const key = `${edit.outputStartMs}:${edit.sourceStartMs}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return Number.isFinite(edit.outputStartMs) && edit.outputEndMs >= edit.outputStartMs;
    })
    .sort((a, b) => a.outputStartMs - b.outputStartMs);
}

/** The clock for a media response; the identity when the render made no edits. */
export function playbackClockFrom(media: EditedMedia | null | undefined): PlaybackClock {
  const edits = editsFrom(media);
  if (edits.length === 0) return identityClock;

  return (renderedMs, edge = 'start') => {
    // Where the last edit left the two clocks: they run together from here until the next one.
    let renderedAt = 0;
    let sourceAt = 0;
    for (const edit of edits) {
      if (renderedMs < edit.outputStartMs || (renderedMs === edit.outputStartMs && edge === 'end')) {
        return sourceAt + (renderedMs - renderedAt);
      }
      const renderedLength = edit.outputEndMs - edit.outputStartMs;
      if (renderedMs < edit.outputEndMs) {
        // Inside a condensed break, which played its source faster.
        const speed = (edit.sourceEndMs - edit.sourceStartMs) / renderedLength;
        return edit.sourceStartMs + (renderedMs - edit.outputStartMs) * speed;
      }
      if (renderedMs === edit.outputEndMs && edge === 'end' && renderedLength > 0) return edit.sourceEndMs;
      renderedAt = edit.outputEndMs;
      sourceAt = edit.sourceEndMs;
    }
    return sourceAt + (renderedMs - renderedAt);
  };
}

/** A rendered turn segment, moved onto the player's clock. */
export function toPlaybackClock(segment: DebateMediaTurnSegment, clock: PlaybackClock): DebateMediaTurnSegment {
  if (clock === identityClock) return segment;
  const outputStartMs = clock(segment.output_start_ms, 'start');
  const outputEndMs = clock(segment.output_end_ms, 'end');
  return {
    ...segment,
    output_start_ms: outputStartMs,
    output_end_ms: outputEndMs,
    duration_ms: outputEndMs - outputStartMs,
    countdown_start_ms:
      segment.countdown_start_ms === undefined ? undefined : clock(segment.countdown_start_ms, 'start'),
  };
}
