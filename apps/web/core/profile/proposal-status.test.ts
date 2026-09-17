import { describe, expect, it } from 'vitest';

import { isAwaitingExecution, proposalStatusFromCurrent } from './use-person-proposals';

/**
 * A proposal's outcome, from `proposals_current`, without counting a single vote.
 *
 * Two earlier versions of this derivation were wrong in opposite directions.
 * `deriveProposalStatus` sees only `(executedAt, endTime)`, so it must guess on
 * an ended unexecuted proposal and guesses REJECTED. Replacing that with a
 * simple majority of the tally traded it for a worse assumption: **there is no
 * one majority rule.** SLOW proposals need a percentage quorum and a support
 * threshold; FAST ones clear on `flatSupportThreshold`, which a single editor's
 * vote can satisfy — and 690 of the reference account's 771 proposals are FAST.
 *
 * `executeBy` removes the need to know. Every ended proposal has a window in
 * which it may still be executed, and once that closes the outcome is settled
 * whatever the votes said. 52 of this account's 54 ended-unexecuted proposals
 * are already past it; 2 are inside it.
 */
const NOW = 1_800_000_000;
const PAST = String(NOW - 1000);
const FUTURE = String(NOW + 1000);

const node = (over: Partial<Parameters<typeof proposalStatusFromCurrent>[0]> = {}) => ({
  executedAt: null,
  unexecutableAt: null,
  endTime: PAST,
  executeBy: PAST,
  ...over,
});

describe('proposalStatusFromCurrent', () => {
  it('is ACCEPTED once executed', () => {
    expect(proposalStatusFromCurrent(node({ executedAt: '123' }), NOW)).toBe('ACCEPTED');
  });

  it('is REJECTED when the graph says it can no longer be executed', () => {
    expect(proposalStatusFromCurrent(node({ unexecutableAt: '123', executeBy: FUTURE }), NOW)).toBe('REJECTED');
  });

  it('is PROPOSED while voting is still open', () => {
    expect(proposalStatusFromCurrent(node({ endTime: FUTURE }), NOW)).toBe('PROPOSED');
  });

  // v2 contracts open the window on the first vote, so zero is "not started".
  // Reading it as "long over" reported every fresh proposal as rejected.
  it('is PROPOSED for a proposal whose voting window has not opened', () => {
    expect(proposalStatusFromCurrent(node({ endTime: '0' }), NOW)).toBe('PROPOSED');
  });

  it('is REJECTED once the execute window has closed without execution', () => {
    // Whatever the vote said, it can no longer happen.
    expect(proposalStatusFromCurrent(node({ executeBy: PAST }), NOW)).toBe('REJECTED');
  });

  it('is PROPOSED while the execute window is still open', () => {
    // "Not yet resolved", not "it passed" — the question this view cannot answer.
    expect(proposalStatusFromCurrent(node({ executeBy: FUTURE }), NOW)).toBe('PROPOSED');
  });

  it('is REJECTED when there is no execute window at all', () => {
    expect(proposalStatusFromCurrent(node({ executeBy: null }), NOW)).toBe('REJECTED');
  });

  // The whole point of the rewrite: no branch reads a vote count, so no branch
  // can be wrong about which voting mode's threshold applied.
  it('ignores the tally entirely', () => {
    const landslide = { ...node(), yesCount: '999', noCount: '0' } as never;
    const wipeout = { ...node(), yesCount: '0', noCount: '999' } as never;

    expect(proposalStatusFromCurrent(landslide, NOW)).toBe(proposalStatusFromCurrent(wipeout, NOW));
  });
});

/**
 * What the status chip needs, separately from the status.
 *
 * `GovernanceStatusChip` renders an ended `PROPOSED` row with `canExecute:
 * false` as **Rejected**, so a record that derives PROPOSED carefully and then
 * hard-codes `canExecute={false}` reports every unresolved proposal as a failed
 * one. The chip takes the Execute *button* separately, via `executeIn`, so a
 * read-only surface can be honest about the first without offering the second.
 */
describe('isAwaitingExecution', () => {
  it('is true for an ended proposal still inside its execute window', () => {
    expect(isAwaitingExecution(node({ executeBy: FUTURE }), NOW)).toBe(true);
  });

  it('is false once executed', () => {
    expect(isAwaitingExecution(node({ executedAt: '1', executeBy: FUTURE }), NOW)).toBe(false);
  });

  it('is false once the graph marks it unexecutable', () => {
    expect(isAwaitingExecution(node({ unexecutableAt: '1', executeBy: FUTURE }), NOW)).toBe(false);
  });

  it('is false while voting is still running', () => {
    // Nothing is awaiting execution until the vote is over.
    expect(isAwaitingExecution(node({ endTime: FUTURE, executeBy: FUTURE }), NOW)).toBe(false);
  });

  it('is false once the execute window has closed', () => {
    expect(isAwaitingExecution(node({ executeBy: PAST }), NOW)).toBe(false);
  });

  it('agrees with the status it drives', () => {
    for (const executeBy of [PAST, FUTURE, null]) {
      const row = node({ executeBy });
      expect(isAwaitingExecution(row, NOW)).toBe(proposalStatusFromCurrent(row, NOW) === 'PROPOSED');
    }
  });
});
