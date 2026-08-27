import { describe, expect, it } from 'vitest';

import { debatePublishableSpacePredicate, isDebatePublishableSpace } from './debate-publish-target';

const DAO_SPACE = '41e851610e13a19441c4d980f2f2ce6b';
const PERSONAL_SPACE = '8a4955bcd9d0fc0d8613f17f01de3b9f';

describe('isDebatePublishableSpace', () => {
  it('accepts a DAO space', () => {
    expect(isDebatePublishableSpace({ type: 'DAO' })).toBe(true);
  });

  // Editor rights on a personal space belong to its owner alone, and the acceptor is never a
  // debater's own space — so the sweep logs `not_editor` and the debate is never published.
  it('rejects a personal space', () => {
    expect(isDebatePublishableSpace({ type: 'PERSONAL' })).toBe(false);
  });

  // Same convention as the claim-space allowlist: filtering against a half-built answer hides
  // claims the viewer is entitled to and then flashes them back in.
  it('treats an unresolved space as publishable rather than filtering on a guess', () => {
    expect(isDebatePublishableSpace(null)).toBe(true);
    expect(isDebatePublishableSpace(undefined)).toBe(true);
  });
});

describe('debatePublishableSpacePredicate', () => {
  it('keeps claims in a DAO space and drops claims in a personal one', () => {
    const canPublish = debatePublishableSpacePredicate(
      new Map([
        [DAO_SPACE, { type: 'DAO' as const }],
        [PERSONAL_SPACE, { type: 'PERSONAL' as const }],
      ])
    );

    expect(canPublish(DAO_SPACE)).toBe(true);
    expect(canPublish(PERSONAL_SPACE)).toBe(false);
  });

  // A claim row carries the spelling the graph was queried with; the space lookup keys on the one
  // the API answered with. Matching them literally let every dashed id read as unresolved.
  it('matches ids across dash spellings', () => {
    const dashed = '8a4955bc-d9d0-fc0d-8613-f17f01de3b9f';
    const canPublish = debatePublishableSpacePredicate(new Map([[PERSONAL_SPACE, { type: 'PERSONAL' as const }]]));

    expect(canPublish(dashed)).toBe(false);
  });

  it('holds a claim whose space has not resolved yet', () => {
    const canPublish = debatePublishableSpacePredicate(new Map());

    expect(canPublish(DAO_SPACE)).toBe(true);
  });

  // A row with no home space has nowhere to publish to at all, which is not the same as "not
  // looked up yet" — it can never resolve.
  it('drops a claim with no home space', () => {
    const canPublish = debatePublishableSpacePredicate(new Map());

    expect(canPublish(null)).toBe(false);
    expect(canPublish('')).toBe(false);
  });
});
