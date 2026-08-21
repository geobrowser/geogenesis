import { describe, expect, it } from 'vitest';

import { type OpenProposalOrder, compareOpenProposals } from './sort-open-proposals';

const OPEN = { unvotedFirst: true, endTime: 'asc' } as const;

function row(over: Partial<OpenProposalOrder> = {}): OpenProposalOrder {
  return { hasViewerVote: false, endTime: 0, submittedAt: 0, ...over };
}

function sorted(rows: OpenProposalOrder[], options = OPEN) {
  return [...rows].sort((a, b) => compareOpenProposals(a, b, options));
}

describe('compareOpenProposals', () => {
  it('orders newest submission first among proposals awaiting their first vote', () => {
    // The reported case: voting is unstamped so every row carries endTime 0, and
    // without submission time they tie and keep the API's arbitrary order.
    const oldest = row({ submittedAt: 100 });
    const newest = row({ submittedAt: 300 });
    const middle = row({ submittedAt: 200 });

    expect(sorted([oldest, newest, middle]).map(r => r.submittedAt)).toEqual([300, 200, 100]);
  });

  it('still closes the soonest-ending proposals first', () => {
    // Submission only breaks ties; it must not reorder proposals that do have windows.
    const closingLater = row({ endTime: 900, submittedAt: 300 });
    const closingSooner = row({ endTime: 500, submittedAt: 100 });

    expect(sorted([closingLater, closingSooner]).map(r => r.endTime)).toEqual([500, 900]);
  });

  it('sinks proposals the viewer already voted on, ahead of every other key', () => {
    const voted = row({ hasViewerVote: true, submittedAt: 900 });
    const unvoted = row({ submittedAt: 100 });

    expect(sorted([voted, unvoted]).map(r => r.hasViewerVote)).toEqual([false, true]);
  });

  it('leaves voted rows in place when a surface does not ask for that rule', () => {
    const voted = row({ hasViewerVote: true, submittedAt: 900 });
    const unvoted = row({ submittedAt: 100 });

    const options = { unvotedFirst: false, endTime: 'desc' } as const;
    expect(sorted([unvoted, voted], options).map(r => r.submittedAt)).toEqual([900, 100]);
  });

  it('honours the descending window order governance home uses', () => {
    const options = { unvotedFirst: true, endTime: 'desc' } as const;
    const rows = [row({ endTime: 500 }), row({ endTime: 900 })];

    expect(sorted(rows, options).map(r => r.endTime)).toEqual([900, 500]);
  });

  it('puts rows with no resolved submission time last rather than first', () => {
    // 0 means "unknown", and reading it as an epoch would float those to the top.
    const unknown = row({ submittedAt: 0 });
    const known = row({ submittedAt: 100 });

    expect(sorted([unknown, known]).map(r => r.submittedAt)).toEqual([100, 0]);
  });
});
