import { describe, expect, it } from 'vitest';

import { MAX_SHARE_CARD_DEBATES, parseRefreshShareCardsBody } from './refresh-share-cards-request';

const ID = (n: number) => `01a1d0d5-7658-7fc0-9bff-${String(n).padStart(12, '0')}`;

describe('parseRefreshShareCardsBody', () => {
  it('is a dry run unless apply is true, and takes dashless ids as dashed', () => {
    expect(
      parseRefreshShareCardsBody({ debateIds: [ID(1), ID(1).replaceAll('-', '').toUpperCase()], reason: ' GEO-3722 ' })
    ).toEqual({ debateIds: [ID(1)], apply: false, reason: 'GEO-3722' });
    expect(parseRefreshShareCardsBody({ debateIds: [ID(1)], apply: true, reason: 'r' })).toMatchObject({
      apply: true,
    });
  });

  it('caps the batch', () => {
    const ids = (count: number) => Array.from({ length: count }, (_, i) => ID(i));
    expect(parseRefreshShareCardsBody({ debateIds: ids(MAX_SHARE_CARD_DEBATES), reason: 'r' })).not.toHaveProperty(
      'error'
    );
    expect(parseRefreshShareCardsBody({ debateIds: ids(MAX_SHARE_CARD_DEBATES + 1), reason: 'r' })).toEqual({
      error: 'too_many_debates',
    });
  });

  it.each([
    [null, 'invalid_body'],
    [{ reason: 'r' }, 'debate_ids_required'],
    [{ debateIds: [], reason: 'r' }, 'debate_ids_required'],
    [{ debateIds: ['nope'], reason: 'r' }, 'invalid_debate_id'],
    [{ debateIds: ['01a1d0d5-76587fc0-9bff-000000000001'], reason: 'r' }, 'invalid_debate_id'],
    [{ debateIds: [ID(1)], apply: 'yes', reason: 'r' }, 'invalid_apply'],
    [{ debateIds: [ID(1)] }, 'reason_required'],
    [{ debateIds: [ID(1)], reason: '  ' }, 'reason_required'],
  ])('refuses %j with %s', (body, error) => {
    expect(parseRefreshShareCardsBody(body)).toEqual({ error });
  });
});
