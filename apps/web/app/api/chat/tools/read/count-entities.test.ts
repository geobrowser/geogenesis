import { beforeEach, expect, it, vi } from 'vitest';

import { countEntities } from './count-entities';

const run = vi.hoisted(() => vi.fn());
vi.mock('../../geo-query/graphql', () => ({ runGeoGraphql: run }));

const execute = (input: { spaceId: string; typeId?: string }) =>
  countEntities.execute!(input, { toolCallId: 'count', messages: [] });
beforeEach(() => run.mockReset());

it('counts distinct entities within a type with one count query and explicit scope', async () => {
  run.mockResolvedValue({ ok: true, data: { entitiesConnection: { totalCount: 63317 } } });
  expect(await execute({ spaceId: 'a'.repeat(32), typeId: 'b'.repeat(32) })).toMatchObject({
    spaceId: 'a'.repeat(32),
    typeId: 'b'.repeat(32),
    totalCount: 63317,
    exact: true,
    scope: 'Distinct published entities of this type in this space.',
  });
  expect(run.mock.calls[0][0]).toContain('first: 0');
  expect(run.mock.calls[0][0]).toContain(`typeId: "${'b'.repeat(32)}"`);
  expect(run).toHaveBeenCalledTimes(1);
});
it('counts the entire space without requiring a type or using a computed-field filter', async () => {
  run.mockResolvedValue({ ok: true, data: { entitiesConnection: { totalCount: 64067 } } });
  expect(await execute({ spaceId: 'a'.repeat(32) })).toMatchObject({
    totalCount: 64067,
    typeId: null,
    exact: true,
    scope: expect.stringContaining('schema and internal'),
  });
  expect(run).toHaveBeenCalledTimes(1);
  expect(run.mock.calls[0][0]).toBe(`{ entitiesConnection(spaceId: "${'a'.repeat(32)}", first: 0) { totalCount } }`);
});

it('forwards cancellation without changing the scope of the count', async () => {
  run.mockResolvedValue({ ok: false, error: 'cancelled' });
  const controller = new AbortController();
  await countEntities.execute!(
    { spaceId: 'a'.repeat(32) },
    { toolCallId: 'count', messages: [], abortSignal: controller.signal }
  );
  expect(run).toHaveBeenCalledWith(expect.not.stringContaining('typeId'), undefined, controller.signal);
});
it('normalizes both space and type identifiers', async () => {
  run.mockResolvedValue({ ok: true, data: { entitiesConnection: { totalCount: 0 } } });
  expect(
    await execute({
      spaceId: 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA',
      typeId: 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB',
    })
  ).toMatchObject({ spaceId: 'a'.repeat(32), typeId: 'b'.repeat(32), totalCount: 0, exact: true });
});
it('does not convert a failed count into zero', async () => {
  run.mockResolvedValue({ ok: false, error: 'Unavailable' });
  expect(await execute({ spaceId: 'a'.repeat(32), typeId: 'b'.repeat(32) })).toMatchObject({ error: 'lookup_failed' });
});
it.each([undefined, null, -1, 1.5, '10', Number.MAX_SAFE_INTEGER + 1])(
  'rejects an invalid returned count: %s',
  async totalCount => {
    run.mockResolvedValue({ ok: true, data: { entitiesConnection: { totalCount } } });
    expect(await execute({ spaceId: 'a'.repeat(32), typeId: 'b'.repeat(32) })).toMatchObject({
      error: 'lookup_failed',
    });
  }
);
it('rejects malformed identifiers before querying', async () => {
  expect(await execute({ spaceId: '" } bad' })).toEqual({ error: 'invalid_input' });
  expect(await execute({ spaceId: 'a'.repeat(32), typeId: 'not-a-type' })).toEqual({ error: 'invalid_input' });
  expect(run).not.toHaveBeenCalled();
});
