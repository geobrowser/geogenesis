import { describe, expect, it } from 'vitest';

import { requestedItemCount } from './requested-item-count';

describe('requestedItemCount', () => {
  it('reads a count the user asked for', () => {
    // Round 7 A2, verbatim: this asked for 15 and the reply listed 5.
    expect(requestedItemCount('can you provide me 15 projects out of this list')).toBe(15);
    expect(requestedItemCount('give me 15 projects from this space')).toBe(15);
    expect(requestedItemCount('show me the top 20')).toBe(20);
    expect(requestedItemCount('list 30 news stories')).toBe(30);
    expect(requestedItemCount('I need 12 entities')).toBe(12);
  });

  it('reads a bare count attached to a plural noun', () => {
    expect(requestedItemCount('15 projects please')).toBe(15);
  });

  it('returns null when no count was named', () => {
    // The default cap must stay in force for ordinary turns — this is what
    // keeps the change off every other reply in the app.
    expect(requestedItemCount('how many news stories are in this space?')).toBeNull();
    expect(requestedItemCount('what projects are in this block?')).toBeNull();
    expect(requestedItemCount('hi')).toBeNull();
    expect(requestedItemCount('')).toBeNull();
  });

  it('ignores durations, which is what date questions are full of', () => {
    // "published in the last 7 days" must not buy a 7-item list budget.
    expect(requestedItemCount('how many articles were published in the last 7 days')).toBeNull();
    expect(requestedItemCount('anything added in the past 3 months?')).toBeNull();
  });

  it('ignores years and id fragments', () => {
    // `\d{1,3}` bounded on both sides: no word boundary lands inside a longer
    // run of digits or hex, so neither can be read as a count.
    expect(requestedItemCount('what happened in 2026 in this space')).toBeNull();
    expect(requestedItemCount('entity c924dc0285594631b3f512c8afff82a7 please')).toBeNull();
  });

  it('reports an oversized ask unclamped, so the caller can say "25 of 200"', () => {
    // Clamping here would lose the number the user actually said, and the reply
    // has to name it — showing 25 without saying 200 were asked for is the same
    // silent-shortfall bug this whole change exists to fix.
    expect(requestedItemCount('give me 200 projects')).toBe(200);
  });

  it('ignores counts the default cap already satisfies', () => {
    // Nothing to buy at or under 5 — and staying quiet here means a stray
    // number can never narrow a list *below* the default. "I saw 3 blocks"
    // must not turn into "list up to 3".
    expect(requestedItemCount('give me 1 project')).toBeNull();
    expect(requestedItemCount('give me 3 projects')).toBeNull();
    expect(requestedItemCount('give me 5 projects')).toBeNull();
    expect(requestedItemCount('there are 3 blocks on this page, describe them')).toBeNull();
  });

  it('takes the largest when several are named', () => {
    expect(requestedItemCount('give me 5 projects and 20 articles')).toBe(20);
  });
});
