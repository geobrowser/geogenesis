import { describe, expect, it, vi } from 'vitest';

import {
  AGENDA_PIN_DAYS,
  type AgendaClaimsIo,
  type RecentAgendaClaim,
  agendaClaimsForTopic,
  fetchRecentAgendaClaims,
  pinAgendaClaims,
} from './recent-agenda-claims';

const DAY = 86_400;
const NOW_S = 1_795_600_000;
const TOPIC = '90ff85ca38574b39ad441fe5f01b34ac';
const SPACE = '89bd89bf28ff8a0963faf92a8c905e20';
const OTHER_SPACE = '4582fbbee28a16589154f7e36f1ee3c5';

const hex = (n: number) => n.toString(16).padStart(32, '0');

function agendaClaim(n: number, listedAt: number, overrides: Partial<RecentAgendaClaim> = {}): RecentAgendaClaim {
  return {
    id: hex(n),
    name: `Claim ${n}`,
    spaceIds: [SPACE],
    topicSpaces: new Map([[TOPIC, new Set([SPACE])]]),
    listedAt,
    ...overrides,
  };
}

describe('fetchRecentAgendaClaims', () => {
  it('counts every listing in the window, removed ones too, with the newest agenda', async () => {
    const io: AgendaClaimsIo = {
      agendas: vi.fn(async () => [
        { id: 'a1', createdAt: NOW_S - 16 * DAY, blockIds: ['b1'] },
        { id: 'a2', createdAt: NOW_S - DAY, blockIds: ['b2'] },
        // Older than the window even if the API returned it.
        { id: 'a3', createdAt: NOW_S - (AGENDA_PIN_DAYS + 1) * DAY, blockIds: ['b3'] },
      ]),
      // Versions: claim 1 was taken off b1 since, and is on b2 too; claim 3 only on the old agenda.
      listings: vi.fn(async (_ids: string[], after: string | undefined) =>
        after
          ? { items: [{ blockId: 'b2', itemId: hex(1) }], endCursor: '2', hasNextPage: false }
          : {
              items: [
                { blockId: 'b1', itemId: hex(1) },
                { blockId: 'b1', itemId: hex(2) },
                { blockId: 'b3', itemId: hex(3) },
                { blockId: 'b2', itemId: hex(4) },
              ],
              endCursor: '1',
              hasNextPage: true,
            }
      ),
      // hex(4) is a debate, not a claim, so the claims read leaves it out.
      claims: vi.fn(async () => [
        { id: hex(1), name: 'One', spaceIds: [SPACE], topics: [{ topicId: TOPIC, spaceId: SPACE }] },
        { id: hex(2), name: 'Two', spaceIds: [OTHER_SPACE], topics: [] },
      ]),
    };

    const claims = await fetchRecentAgendaClaims({ nowMs: NOW_S * 1000, io });

    expect(io.agendas).toHaveBeenCalledWith(NOW_S - AGENDA_PIN_DAYS * DAY, undefined);
    expect((io.listings as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toEqual(['b1', 'b2']);
    expect((io.claims as ReturnType<typeof vi.fn>).mock.calls[0]![0].sort()).toEqual([hex(1), hex(2), hex(4)]);
    expect(claims.map(c => [c.id, c.listedAt])).toEqual([
      [hex(1), NOW_S - DAY],
      [hex(2), NOW_S - 16 * DAY],
    ]);
    expect(claims[0]!.topicSpaces.get(TOPIC)).toEqual(new Set([SPACE]));
  });

  it('asks nothing more when no agenda is in the window', async () => {
    const io: AgendaClaimsIo = { agendas: vi.fn(async () => []), listings: vi.fn(), claims: vi.fn() };
    expect(await fetchRecentAgendaClaims({ nowMs: NOW_S * 1000, io })).toEqual([]);
    expect(io.listings).not.toHaveBeenCalled();
    expect(io.claims).not.toHaveBeenCalled();
  });
});

describe('agendaClaimsForTopic', () => {
  it('keeps only claims the page space tagged with this topic', () => {
    const mine = agendaClaim(1, NOW_S);
    const otherSpace = agendaClaim(2, NOW_S, { topicSpaces: new Map([[TOPIC, new Set([OTHER_SPACE])]]) });
    const otherTopic = agendaClaim(3, NOW_S, { topicSpaces: new Map([[hex(99), new Set([SPACE])]]) });
    expect(agendaClaimsForTopic([mine, otherSpace, otherTopic], TOPIC, SPACE)).toEqual([mine]);
  });
});

describe('pinAgendaClaims', () => {
  const seed = (n: number) => ({ id: hex(n), title: `Seed ${n}` });
  const makeSeed = (claim: RecentAgendaClaim) => ({ id: claim.id, title: `Added ${claim.name}` });

  it('puts agenda claims first by Best rank, then newest agenda, then the rest unchanged', () => {
    const seeds = [seed(1), seed(2), seed(3), seed(4), seed(5)];
    const out = pinAgendaClaims({
      seeds,
      // Best ranks 4 above 2. 7 and 8 are not in Best; 8 is on the newer agenda.
      agendaClaims: [
        agendaClaim(2, NOW_S - 5 * DAY),
        agendaClaim(7, NOW_S - 9 * DAY),
        agendaClaim(4, NOW_S - 2 * DAY),
        agendaClaim(8, NOW_S - DAY),
      ],
      bestIds: [hex(1), hex(4), hex(3), hex(2), hex(5)],
      makeSeed,
    });
    expect(out.map(s => s.title)).toEqual([
      'Seed 4',
      'Seed 2',
      'Added Claim 8',
      'Added Claim 7',
      'Seed 1',
      'Seed 3',
      'Seed 5',
    ]);
  });

  it('never lists a claim twice', () => {
    const out = pinAgendaClaims({
      seeds: [seed(1), seed(2), seed(1)],
      agendaClaims: [agendaClaim(2, NOW_S - DAY), agendaClaim(2, NOW_S)],
      bestIds: [hex(1), hex(2)],
      makeSeed,
    });
    expect(out.map(s => s.id)).toEqual([hex(2), hex(1)]);
  });

  it('leaves the order alone with no agenda claims', () => {
    const seeds = [seed(3), seed(1)];
    expect(pinAgendaClaims({ seeds, agendaClaims: [], bestIds: [hex(1), hex(3)], makeSeed })).toEqual(seeds);
  });
});
