import { describe, expect, it } from 'vitest';

import { parseGraphLinkHref, resolveGraphLinkHref } from './graph-link';

const ENTITY_ID = '11111111111111111111111111111111';
const SPACE_ID = '22222222222222222222222222222222';
const FALLBACK_SPACE_ID = '33333333333333333333333333333333';

describe('graph-link utilities', () => {
  it('parses graph links with a target space', () => {
    expect(parseGraphLinkHref(`graph://${ENTITY_ID}?s=${SPACE_ID}`)).toEqual({
      entityId: ENTITY_ID,
      spaceId: SPACE_ID,
      graphHref: `graph://${ENTITY_ID}?s=${SPACE_ID}`,
    });
  });

  it('resolves graph links through their target space', () => {
    expect(resolveGraphLinkHref(`graph://${ENTITY_ID}?s=${SPACE_ID}`, FALLBACK_SPACE_ID)).toEqual({
      entityId: ENTITY_ID,
      spaceId: SPACE_ID,
      href: `/space/${SPACE_ID}/${ENTITY_ID}`,
    });
  });

  it('falls back to the current space when the graph link does not include one', () => {
    expect(resolveGraphLinkHref(`graph://${ENTITY_ID}`, FALLBACK_SPACE_ID)).toEqual({
      entityId: ENTITY_ID,
      spaceId: FALLBACK_SPACE_ID,
      href: `/space/${FALLBACK_SPACE_ID}/${ENTITY_ID}`,
    });
  });

  it('rejects malformed graph links', () => {
    expect(parseGraphLinkHref('graph://foo')).toBeNull();
    expect(resolveGraphLinkHref('graph://foo', FALLBACK_SPACE_ID)).toBeNull();
  });
});
