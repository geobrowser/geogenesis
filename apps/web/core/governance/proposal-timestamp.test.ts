import { describe, expect, it } from 'vitest';

import { proposalTimestampSeconds } from './proposal-timestamp';

const SUBMITTED = 1_786_969_318;
const VOTING_STARTED = 1_787_228_344;
const FAR_FUTURE = 4_102_444_800; // 2100
const FAR_PAST = 1_000_000_000; // 2001

describe('proposalTimestampSeconds', () => {
  it('shows the submission time while voting has not started', () => {
    // The case from the report: v2 contracts leave both stamps at 0 until the first
    // vote, so the row had no date at all to show.
    expect(
      proposalTimestampSeconds({ status: 'PROPOSED', startTime: 0, endTime: 0, submittedAt: SUBMITTED })
    ).toBe(SUBMITTED);
  });

  it('shows the submission time while voting is under way', () => {
    // startTime is stamped here, but it is when voting opened, not when the proposal
    // was put up — which is what an open row should say.
    expect(
      proposalTimestampSeconds({
        status: 'PROPOSED',
        startTime: VOTING_STARTED,
        endTime: FAR_FUTURE,
        submittedAt: SUBMITTED,
      })
    ).toBe(SUBMITTED);
  });

  it('keeps the voting timestamp once the proposal has settled', () => {
    for (const status of ['ACCEPTED', 'REJECTED'] as const) {
      expect(
        proposalTimestampSeconds({ status, startTime: VOTING_STARTED, endTime: FAR_PAST, submittedAt: SUBMITTED })
      ).toBe(VOTING_STARTED);
    }
  });

  it('keeps the voting timestamp once voting has run out, before execution', () => {
    // Still PROPOSED, but the window has closed — this is the pending-execution row,
    // which is neither of the two periods that should show a submission time.
    expect(
      proposalTimestampSeconds({
        status: 'PROPOSED',
        startTime: VOTING_STARTED,
        endTime: FAR_PAST,
        submittedAt: SUBMITTED,
      })
    ).toBe(VOTING_STARTED);
  });

  it('reports no timestamp when the submission time could not be resolved', () => {
    expect(proposalTimestampSeconds({ status: 'PROPOSED', startTime: 0, endTime: 0, submittedAt: 0 })).toBe(0);
  });
});
