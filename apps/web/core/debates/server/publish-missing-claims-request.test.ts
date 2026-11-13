import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_APPLY_DEBATES,
  MAX_DRY_RUN_DEBATES,
  isAcceptorAdmin,
  parsePublishMissingClaimsBody,
} from './publish-missing-claims-request';

const ID = (n: number) => `01a1d0d5-7658-7fc0-9bff-${String(n).padStart(12, '0')}`;
const ids = (count: number) => Array.from({ length: count }, (_, i) => ID(i));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('parsePublishMissingClaimsBody', () => {
  it('is a dry run unless apply is true, keeping the text as it is by default', () => {
    expect(parsePublishMissingClaimsBody({ debateIds: [ID(1), ID(1)], reason: ' GEO-3635 ' })).toEqual({
      debateIds: [ID(1)],
      apply: false,
      expect: {},
      blockText: 'keep',
      reason: 'GEO-3635',
    });
  });

  it('caps a dry run at 25 debates and an apply at 2', () => {
    expect(parsePublishMissingClaimsBody({ debateIds: ids(MAX_DRY_RUN_DEBATES), reason: 'r' })).not.toHaveProperty(
      'error'
    );
    expect(parsePublishMissingClaimsBody({ debateIds: ids(MAX_DRY_RUN_DEBATES + 1), reason: 'r' })).toEqual({
      error: 'too_many_debates',
    });
    const expectAll = (list: string[]) => Object.fromEntries(list.map(id => [id, 'f']));
    const two = ids(MAX_APPLY_DEBATES);
    expect(
      parsePublishMissingClaimsBody({ debateIds: two, apply: true, expect: expectAll(two), reason: 'r' })
    ).not.toHaveProperty('error');
    const three = ids(MAX_APPLY_DEBATES + 1);
    expect(
      parsePublishMissingClaimsBody({ debateIds: three, apply: true, expect: expectAll(three), reason: 'r' })
    ).toEqual({ error: 'too_many_debates' });
  });

  it('needs a reviewed fingerprint for every debate it applies', () => {
    expect(
      parsePublishMissingClaimsBody({ debateIds: [ID(1), ID(2)], apply: true, expect: { [ID(1)]: 'f' }, reason: 'r' })
    ).toEqual({ error: 'expect_required' });
  });

  it.each([
    [{ debateIds: [], reason: 'r' }, 'debate_ids_required'],
    [{ debateIds: ['nope'], reason: 'r' }, 'invalid_debate_id'],
    [{ debateIds: [ID(1)] }, 'reason_required'],
    [{ debateIds: [ID(1)], reason: 'r', apply: 'yes' }, 'invalid_apply'],
    [{ debateIds: [ID(1)], reason: 'r', blockText: 'replace' }, 'invalid_block_text'],
    [{ debateIds: [ID(1)], reason: 'r', expect: [] }, 'invalid_expect'],
  ])('refuses %j', (body, error) => {
    expect(parsePublishMissingClaimsBody(body)).toEqual({ error });
  });
});

describe('isAcceptorAdmin', () => {
  it('is nobody while the allowlist is unset', () => {
    vi.stubEnv('DEBATE_ACCEPTOR_ADMIN_SPACE_IDS', '');
    expect(isAcceptorAdmin('f3dab79cb5a3d9d1759656dd5361d1c6')).toBe(false);
  });

  it('matches listed spaces in either id form, quoted or not', () => {
    vi.stubEnv('DEBATE_ACCEPTOR_ADMIN_SPACE_IDS', '"f3dab79c-b5a3-d9d1-7596-56dd5361d1c6, aaaa"');
    expect(isAcceptorAdmin('f3dab79cb5a3d9d1759656dd5361d1c6')).toBe(true);
    expect(isAcceptorAdmin('cd259c86000000000000000000000000')).toBe(false);
  });
});
