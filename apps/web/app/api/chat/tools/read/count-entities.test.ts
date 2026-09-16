import { beforeEach, expect, it, vi } from 'vitest';

import { countEntities } from './count-entities';

const run = vi.hoisted(() => vi.fn());
vi.mock('../../geo-query/graphql', () => ({ runGeoGraphql: run }));

const execute = (input: { spaceId: string; typeId?: string }) =>
  countEntities.execute!(input, { toolCallId: 'count', messages: [] });
beforeEach(() => run.mockReset());

it('counts distinct space entities with one count query and explicit scope', async () => {
  run.mockResolvedValue({ ok: true, data: { entitiesConnection: { totalCount: 63317 } } });
  expect(await execute({ spaceId: 'a'.repeat(32) })).toMatchObject({
    totalCount: 63317,
    exact: true,
    scope: expect.stringContaining('internal'),
  });
  expect(run.mock.calls[0][0]).toContain('first: 0');
  expect(run).toHaveBeenCalledTimes(1);
});
it('does not convert a failed count into zero', async () => {
  run.mockResolvedValue({ ok: false, error: 'Unavailable' });
  expect(await execute({ spaceId: 'a'.repeat(32) })).toMatchObject({ error: 'lookup_failed' });
});
it('rejects malformed identifiers before querying', async () => {
  expect(await execute({ spaceId: '" } bad' })).toEqual({ error: 'invalid_input' });
  expect(run).not.toHaveBeenCalled();
});
