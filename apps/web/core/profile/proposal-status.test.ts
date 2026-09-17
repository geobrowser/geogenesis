import { describe, expect, it } from 'vitest';

import { proposalStatusFromCurrent } from './use-person-proposals';

/**
 * A proposal's outcome, from the columns `proposals_current` actually has.
 *
 * The case this exists for: **ended, passed, not yet executed.** `deriveProposalStatus`
 * sees only `(executedAt, endTime)`, so with the window closed and no execution
 * it must guess, and it guesses REJECTED — a governance record stating that
 * somebody's accepted proposal failed. Upstream models this explicitly as
 * `EXECUTABLE` and maps it to `PROPOSED`.
 *
 * 2 of 20,000 proposals scanned across the graph are in that state, and 23 carry
 * `unexecutableAt`.
 */
const NOW = 1_800_000_000;

const node = (over: Partial<Parameters<typeof proposalStatusFromCurrent>[0]> = {}) => ({
  executedAt: null,
  unexecutableAt: null,
  endTime: String(NOW - 1000),
  yesCount: '0',
  noCount: '0',
  abstainCount: '0',
  ...over,
});

describe('proposalStatusFromCurrent', () => {
  it('is ACCEPTED once executed, whatever the tally says', () => {
    expect(proposalStatusFromCurrent(node({ executedAt: '123', noCount: '99' }), NOW)).toBe('ACCEPTED');
  });

  it('is REJECTED when the graph says it can no longer be executed', () => {
    // `unexecutableAt` is the authoritative signal and outranks the tally.
    expect(proposalStatusFromCurrent(node({ unexecutableAt: '123', yesCount: '99' }), NOW)).toBe('REJECTED');
  });

  it('is PROPOSED while the window is still open', () => {
    expect(proposalStatusFromCurrent(node({ endTime: String(NOW + 1000) }), NOW)).toBe('PROPOSED');
  });

  // v2 contracts open the window on the first vote, so zero is "not started".
  // Reading it as "long over" reported every fresh proposal as rejected.
  it('is PROPOSED for a proposal whose window has not opened', () => {
    expect(proposalStatusFromCurrent(node({ endTime: '0' }), NOW)).toBe('PROPOSED');
  });

  it('is PROPOSED when it ended with a majority and is awaiting execution', () => {
    expect(proposalStatusFromCurrent(node({ yesCount: '3', noCount: '1' }), NOW)).toBe('PROPOSED');
  });

  it('is REJECTED when it ended without a majority', () => {
    expect(proposalStatusFromCurrent(node({ yesCount: '1', noCount: '3' }), NOW)).toBe('REJECTED');
  });

  it('is REJECTED when it ended with nobody voting', () => {
    expect(proposalStatusFromCurrent(node(), NOW)).toBe('REJECTED');
  });

  // A bare majority of everything cast, abstentions included — the same base the
  // row's percentages use, so the chip and the bars cannot disagree.
  it('counts abstentions in the denominator', () => {
    expect(proposalStatusFromCurrent(node({ yesCount: '2', noCount: '1', abstainCount: '2' }), NOW)).toBe('REJECTED');
    expect(proposalStatusFromCurrent(node({ yesCount: '3', noCount: '1', abstainCount: '1' }), NOW)).toBe('PROPOSED');
  });

  it('needs more than half, not half', () => {
    expect(proposalStatusFromCurrent(node({ yesCount: '2', noCount: '2' }), NOW)).toBe('REJECTED');
  });

  it('reads the counts as the strings the graph sends', () => {
    // Every one of these columns is a BigInt over the wire, so they arrive as
    // strings. Comparing them unconverted would compare text.
    expect(proposalStatusFromCurrent(node({ yesCount: '10', noCount: '9' }), NOW)).toBe('PROPOSED');
  });
});
