import { describe, expect, it } from 'vitest';

import { type VersionableTask, taskVersion } from './debate-claims';

/**
 * The gate between a reader's answers and the graph.
 *
 * An answer is a pair of segment indices and nothing else — no milliseconds, by design, so a
 * timecode can only ever be a real boundary of the recording. The cost of that design is that an
 * answer means nothing away from the task file it was read against: re-cut the transcript and the
 * same indices still resolve, to different words. This is what catches that, so what it does and
 * does not notice is the whole of the guarantee.
 */
describe('taskVersion', () => {
  /** Wider than `VersionableTask` so the fixtures can carry the fields the real task file does. */
  type Task = VersionableTask & {
    debateName?: string | null;
    turns: {
      blockId: string;
      segments: { i: number; startMs: number; endMs: number; text: string }[];
      claims: { claimId: string; text: string; published?: unknown; matcherGuess?: unknown }[];
    }[];
  };

  const task = (overrides: Partial<Task> = {}): Task => ({
    debateEntityId: 'debate-1',
    debateName: 'Getting married',
    turns: [
      {
        blockId: 'block-1',
        segments: [
          { i: 0, startMs: 0, endMs: 1_000, text: 'marriage is a contract' },
          { i: 1, startMs: 1_000, endMs: 2_400, text: 'and contracts can be broken' },
        ],
        claims: [{ claimId: 'claim-1', text: 'Marriage is a contract.', published: null, matcherGuess: null }],
      },
    ],
    ...overrides,
  });

  it('gives the same task the same version', () => {
    expect(taskVersion(task())).toBe(taskVersion(task()));
  });

  it('is short enough to copy into an answers file by hand', () => {
    expect(taskVersion(task())).toMatch(/^[0-9a-f]{12}$/);
  });

  /**
   * The failure this exists for. A re-transcription moves the boundaries under the same indices, so
   * every check in `build-plan-from-matches.ts` still passes and the published offset is wrong.
   */
  it('changes when a segment boundary moves', () => {
    const recut = task();
    recut.turns[0].segments[1] = { i: 1, startMs: 1_200, endMs: 2_600, text: 'and contracts can be broken' };

    expect(taskVersion(recut)).not.toBe(taskVersion(task()));
  });

  // The reader matched the claim's wording, so a claim reworded between export and read is a claim
  // whose answer was about a different sentence.
  it('changes when a claim is reworded', () => {
    const reworded = task();
    reworded.turns[0].claims[0].text = 'Marriage is a legal contract.';

    expect(taskVersion(reworded)).not.toBe(taskVersion(task()));
  });

  it('changes when a claim is filed under a different turn', () => {
    const refiled = task();
    refiled.turns[0].blockId = 'block-2';

    expect(taskVersion(refiled)).not.toBe(taskVersion(task()));
  });

  it('changes when a claim joins the turn', () => {
    const grown = task();
    grown.turns[0].claims.push({ claimId: 'claim-2', text: 'Contracts can be broken.' });

    expect(taskVersion(grown)).not.toBe(taskVersion(task()));
  });

  /**
   * Deliberately blind to these two.
   *
   * `published` and `matcherGuess` are re-read from the current task file when the plan is built,
   * so a backfill landing between the read and the run leaves the reader's segment choice exactly
   * as good as it was. Versioning them would throw away correct work every time anything published
   * — which is the common case, since this pipeline is what publishes.
   */
  it('ignores what has been published since, and what the matcher guessed', () => {
    const republished = task();
    republished.turns[0].claims[0].published = { startMs: 0, endMs: 2_400, onSegmentBoundaries: true };
    republished.turns[0].claims[0].matcherGuess = { startSegment: 0, endSegment: 1, score: 0.81 };

    expect(taskVersion(republished)).toBe(taskVersion(task()));
  });

  // Segment *text* is not versioned either: the indices and their times are what an answer resolves
  // through, and a re-punctuated segment at the same boundaries is the same moment of the recording.
  it('ignores a segment respelled at the same boundaries', () => {
    const respelled = task();
    respelled.turns[0].segments[0].text = 'Marriage is a contract,';

    expect(taskVersion(respelled)).toBe(taskVersion(task()));
  });

  it('tells two debates apart', () => {
    expect(taskVersion(task({ debateEntityId: 'debate-2' }))).not.toBe(taskVersion(task()));
  });
});
