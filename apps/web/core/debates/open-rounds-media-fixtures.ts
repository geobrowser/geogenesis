import type { DebateMediaResponse, DebateMediaRoundPick, DebateMediaTurnSegment } from './api';

/**
 * The Preston vs Adam debate (01a1369d…) as geo-chat's condensed render published it (GEO-3276),
 * copied from its media response and render metadata on 2026-10-14. Times named `output_*` are the
 * rendered video's; `RENDERED_SOURCE_TURNS` is the same render's own record of where each turn sits
 * in the raw recordings, which is what the web player plays.
 */

export const DEBATE_STARTED_AT = '2026-10-13T18:56:05.738851Z';

export const RENDERED_TURN_SEGMENTS: DebateMediaTurnSegment[] = [
  {
    turn_index: 0,
    participant_slot: 1,
    output_start_ms: 0,
    output_end_ms: 60_000,
    duration_ms: 60_000,
    countdown_start_ms: 0,
  },
  {
    turn_index: 1,
    participant_slot: 2,
    output_start_ms: 60_000,
    output_end_ms: 120_000,
    duration_ms: 60_000,
    countdown_start_ms: 60_000,
  },
  {
    turn_index: 2,
    participant_slot: 1,
    output_start_ms: 121_600,
    output_end_ms: 166_600,
    duration_ms: 45_000,
    countdown_start_ms: 121_600,
  },
  {
    turn_index: 3,
    participant_slot: 2,
    output_start_ms: 166_600,
    output_end_ms: 211_600,
    duration_ms: 45_000,
    countdown_start_ms: 166_600,
  },
  {
    turn_index: 4,
    participant_slot: 1,
    output_start_ms: 214_000,
    output_end_ms: 254_994,
    duration_ms: 40_994,
    countdown_start_ms: 214_000,
  },
  {
    turn_index: 5,
    participant_slot: 2,
    output_start_ms: 254_994,
    output_end_ms: 301_430,
    duration_ms: 46_436,
    countdown_start_ms: 255_294,
  },
];

/** `render_metadata.timeline_segments`' `source_*` for each turn. */
export const RENDERED_SOURCE_TURNS: Array<[number, number, number]> = [
  [0, 0, 60_000],
  [1, 60_000, 120_000],
  [2, 128_000, 173_000],
  [3, 173_000, 218_000],
  [4, 229_950, 270_944],
  [5, 274_650, 321_086],
];

const pick = (
  round: number,
  slot: 1 | 2,
  value: 'extend' | 'end',
  at: string,
  previous: 'extend' | 'end' | null = null
): DebateMediaRoundPick => ({
  round_index: round,
  participant_slot: slot,
  pick: value,
  previous_pick: previous,
  turn_index: round * 2 + 1,
  during_decision: true,
  at,
  output_ms: 0,
});

export const RENDERED_MEDIA: Pick<
  DebateMediaResponse,
  'turn_segments' | 'condensed_breaks' | 'early_end_gaps' | 'round_results' | 'round_picks'
> = {
  turn_segments: RENDERED_TURN_SEGMENTS,
  condensed_breaks: [
    {
      kind: 'lead_in',
      round_index: 0,
      next_round_index: 1,
      output_start_ms: 120_000,
      output_end_ms: 121_600,
      duration_ms: 1_600,
      source_start_ms: 120_000,
      source_end_ms: 128_000,
      speed: 5,
    },
    {
      kind: 'extend',
      round_index: 1,
      next_round_index: 2,
      output_start_ms: 211_600,
      output_end_ms: 214_000,
      duration_ms: 2_400,
      source_start_ms: 221_950,
      source_end_ms: 229_950,
      speed: 3.33,
    },
    {
      kind: 'final_end',
      round_index: 2,
      output_start_ms: 301_430,
      output_end_ms: 303_430,
      duration_ms: 2_000,
      source_start_ms: 330_481,
      source_end_ms: 333_481,
      speed: 1.5,
    },
  ],
  early_end_gaps: [
    {
      turn_index: 4,
      next_turn_index: 5,
      output_ms: 254_994,
      source_start_ms: 270_944,
      source_end_ms: 274_650,
      removed_ms: 3_706,
      quiet_kept_ms: 300,
    },
  ],
  round_results: [
    {
      round_index: 1,
      output_start_ms: 211_600,
      output_end_ms: 214_000,
      duration_ms: 2_400,
      source_start_ms: 221_950,
      source_end_ms: 229_950,
    },
  ],
  round_picks: [
    pick(1, 1, 'extend', '2026-10-13T18:59:45.101014Z'),
    pick(1, 2, 'extend', '2026-10-13T18:59:47.680244Z'),
    // Round 3 (index 2): Preston changed his mind once; Adam never picked.
    pick(2, 1, 'end', '2026-10-13T19:01:20.000Z'),
    pick(2, 1, 'extend', '2026-10-13T19:01:28.000Z', 'end'),
  ],
};
