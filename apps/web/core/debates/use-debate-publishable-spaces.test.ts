import { describe, expect, it } from 'vitest';

import { isSpaceDebatePublishable } from './use-debate-publishable-spaces';

const EDITED = '41e851610e13a19441c4d980f2f2ce6b';
const NOT_EDITED = '8a4955bcd9d0fc0d8613f17f01de3b9f';

describe('isSpaceDebatePublishable', () => {
  it('accepts a space the acceptor edits', () => {
    expect(isSpaceDebatePublishable(EDITED, new Set([EDITED]))).toBe(true);
  });

  // The case the space-type test cannot see: a perfectly ordinary public space that the acceptor
  // simply is not an editor of. A debate there fails on-chain exactly as a personal space does.
  it('rejects a space the acceptor does not edit', () => {
    expect(isSpaceDebatePublishable(NOT_EDITED, new Set([EDITED]))).toBe(false);
  });

  // A claim row carries the spelling the graph was queried with; the editor list carries the one
  // the API answered with. Matching them literally would reject every dashed id.
  it('matches ids across dash spellings', () => {
    const dashed = '41e85161-0e13-a194-41c4-d980f2f2ce6b';
    expect(isSpaceDebatePublishable(dashed, new Set([EDITED]))).toBe(true);
  });

  // `null` is "the lookup has no answer" — no acceptor configured, or it failed. Reading that as
  // "nothing is publishable" would empty every list in the picker on a transient error, and local
  // environments run with no acceptor at all.
  it('does not filter while the answer is unknown', () => {
    expect(isSpaceDebatePublishable(NOT_EDITED, null)).toBe(true);
  });

  // An empty set is a real answer, unlike null: the acceptor edits nothing, so nothing is debatable.
  it('rejects everything when the acceptor genuinely edits no spaces', () => {
    expect(isSpaceDebatePublishable(EDITED, new Set())).toBe(false);
  });

  it('rejects a claim with no home space at all', () => {
    expect(isSpaceDebatePublishable(null, new Set([EDITED]))).toBe(false);
    expect(isSpaceDebatePublishable('', new Set([EDITED]))).toBe(false);
  });
});
