import { describe, expect, it, vi } from 'vitest';

import { claimCallEntities, recordCallEntity } from './service';

vi.mock('~/core/debates/server/geo-chat-base-url', () => ({ geoChatBaseUrl: () => 'http://geo-chat' }));

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('claimCallEntities', () => {
  it('does nothing without a token', async () => {
    const fetcher = vi.fn();
    expect(await claimCallEntities(['a'.repeat(32)], 4, { token: null, fetcher })).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('sends dashless space ids with the bearer token', async () => {
    const fetcher = vi.fn(async () => json(200, { calls: [] }));
    await claimCallEntities(['AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA'], 4, { token: 't', fetcher });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://geo-chat/service/call-entities/claim');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer t');
    expect(JSON.parse(init.body as string)).toEqual({ space_ids: ['a'.repeat(32)], limit: 4 });
  });

  it('reads the switch being off, and an older geo-chat, as nothing to do', async () => {
    const off = vi.fn(async () => json(403, { error: { code: 'call_entities_disabled' } }));
    expect(await claimCallEntities(['a'.repeat(32)], 4, { token: 't', fetcher: off })).toBeNull();
    const old = vi.fn(async () => new Response('', { status: 404 }));
    expect(await claimCallEntities(['a'.repeat(32)], 4, { token: 't', fetcher: old })).toBeNull();
  });

  it('throws on a refused token', async () => {
    const fetcher = vi.fn(async () => json(401, { error: { code: 'invalid_service_token' } }));
    await expect(claimCallEntities(['a'.repeat(32)], 4, { token: 't', fetcher })).rejects.toThrow('401');
  });
});

describe('recordCallEntity', () => {
  it('normalises ids it sends', async () => {
    const fetcher = vi.fn(async () => json(200, { current: true }));
    await recordCallEntity(
      'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA',
      {
        claim_id: 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB',
        outcome: 'written',
        entity_id: 'CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC',
      },
      { token: 't', fetcher }
    );
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`http://geo-chat/service/call-entities/${'a'.repeat(32)}`);
    expect(JSON.parse(init.body as string)).toEqual({
      claim_id: 'b'.repeat(32),
      outcome: 'written',
      entity_id: 'c'.repeat(32),
    });
  });

  it('reads the two 409s', async () => {
    const conflict = vi.fn(async () =>
      json(409, { error: { code: 'call_entity_id_conflict', details: { entity_id: 'D'.repeat(32) } } })
    );
    expect(
      await recordCallEntity(
        'a'.repeat(32),
        { claim_id: 'b'.repeat(32), outcome: 'written', entity_id: 'c'.repeat(32) },
        {
          token: 't',
          fetcher: conflict,
        }
      )
    ).toEqual({ status: 'id_conflict', entityId: 'd'.repeat(32) });
    const lost = vi.fn(async () => json(409, { error: { code: 'call_entity_claim_lost' } }));
    expect(
      await recordCallEntity(
        'a'.repeat(32),
        { claim_id: 'b'.repeat(32), outcome: 'failed', error: 'x' },
        {
          token: 't',
          fetcher: lost,
        }
      )
    ).toEqual({ status: 'claim_lost' });
    const taken = vi.fn(async () => json(409, { error: { code: 'call_entity_id_taken' } }));
    expect(
      await recordCallEntity(
        'a'.repeat(32),
        { claim_id: 'b'.repeat(32), outcome: 'written', entity_id: 'c'.repeat(32) },
        { token: 't', fetcher: taken }
      )
    ).toEqual({ status: 'id_taken' });
  });
});
