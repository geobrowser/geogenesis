import { djb2Hash } from 'next/dist/shared/lib/hash';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { ID } from '~/core/id';
import { HIDDEN_PROPERTY_ID } from '~/core/moderation/hidden';
import type { Relation, Value } from '~/core/types';

import type { Debate, DebateMediaResponse } from '../api';
import { buildDebatePublishDraft, debateShareCardEntityId } from '../debate-publish-draft';
import {
  IMAGE_TYPE_ID,
  IMAGE_URL_PROPERTY_ID,
  NAME_PROPERTY_ID,
  OG_IMAGE_PROPERTY_ID,
  TYPES_PROPERTY_ID,
} from '../ontology';
import { debatePublishParticipants } from './debate-source';
import {
  ENTITY_OG_IMAGE_ROUTE_SUFFIX,
  type RefreshShareCardsDeps,
  SHARE_CARD_CHUNK_SIZE,
  SHARE_CARD_SUBMIT_DEADLINE_MS,
  type ShareCardImage,
  entityShareImagePath,
  readShareCards,
  refreshDebateShareCards,
  shareCardEdit,
} from './refresh-debate-share-cards';

const SPACE = 'c9f267dcb0d270718c2a3c45a64afd32';
const OTHER_SPACE = 'aa00aa00aa00aa00aa00aa00aa00aa00';
const CONFIG = { privateKey: '0x01' as const, spaceId: 'acceptor-space' };
const OLD = 'ipfs://bafyold';
const NEW = 'ipfs://bafynew';
const CARD_A = '0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0a';
const CARD_B = '0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0b';

/** geo-chat debate ids: the version nibble is 7. */
const debateId = (n: number) => `01a1d0d5-7658-7fc0-9bff-${String(n).padStart(12, '0')}`;
const key = (id: string) => ID.uuidToHex(id);

function debateFor(id: string, spaceId = SPACE, overrides: Partial<Debate> = {}): Debate {
  return {
    id,
    status: 'complete',
    recording_cancelled_at: null,
    claim: { space_id: spaceId, claim_entity_id: '0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a', claim: 'The motion' },
    participants: [
      { profile_space_id: '1111111111111111111111111111111a', display_name: 'A', position: true, participant_slot: 1 },
      { profile_space_id: '2222222222222222222222222222222b', display_name: 'B', position: false, participant_slot: 2 },
    ],
    ...overrides,
  } as unknown as Debate;
}

const WITH_STILLS = {
  job: { status: 'succeeded' },
  artifacts: [{ kind: 'speaker_still_slot_1' }, { kind: 'speaker_still_slot_2' }],
} as unknown as DebateMediaResponse;
const NO_STILLS = { job: { status: 'succeeded' }, artifacts: [] } as unknown as DebateMediaResponse;

type World = {
  debates?: Record<string, Debate>;
  cards?: Record<string, ShareCardImage[]>;
  media?: Record<string, DebateMediaResponse>;
};

function setup(world: World = {}, overrides: Partial<RefreshShareCardsDeps> = {}) {
  const debates = world.debates ?? {};
  const submit = vi.fn(async (_config: unknown, _edit: { name: string; ops: unknown[]; space: unknown }) => '0xhash');
  const prepareOps = vi.fn(
    async (values: Value[], relations: Relation[], _spaceId: string) =>
      [...values, ...relations].map(() => ({ type: 'op' })) as never
  );
  const renderAndPin = vi.fn(async () => NEW);
  const clearCachedShareImage = vi.fn();
  const withLock = vi.fn(async <T>(fn: () => Promise<T>) => ({ ran: true as const, value: await fn() }));
  const deps: Partial<RefreshShareCardsDeps> = {
    getConfig: () => CONFIG,
    readVisibility: async entityId => {
      const debate = Object.values(debates).find(d => key(d.id) === entityId);
      return debate ? { visibility: 'visible', debate } : { visibility: 'removed', debate: null };
    },
    loadDebateEntity: async () => ({ values: [] }),
    loadMedia: async id => world.media?.[id] ?? WITH_STILLS,
    readShareCards: async entityId => {
      const debate = Object.values(debates).find(d => key(d.id) === entityId);
      return (debate && world.cards?.[debate.id]) ?? [];
    },
    loadEditableSpace: async spaceId => ({ id: spaceId, type: 'DAO', address: '0xspace' }),
    cardData: async (_id, debate) => ({ claim: debate.claim.claim, speakers: [] as never }),
    renderAndPin,
    prepareOps,
    submit: submit as never,
    withLock: withLock as never,
    clearCachedShareImage,
    now: () => 0,
    ...overrides,
  };
  return { deps, submit, prepareOps, renderAndPin, clearCachedShareImage, withLock };
}

const world = (
  ids: string[],
  cards: Record<string, ShareCardImage[]> = {},
  spaceOf: (id: string) => string = () => SPACE
) => ({
  debates: Object.fromEntries(ids.map(id => [id, debateFor(id, spaceOf(id))])),
  cards,
});

const ran = (run: Awaited<ReturnType<typeof refreshDebateShareCards>>) => {
  if (run.status !== 'ran') throw new Error(`expected a run, got ${run.status}`);
  return run;
};

const valueKeys = (values: Value[]) => values.map(v => `${key(v.entity.id)}|${key(v.property.id)}|${v.value}`).sort();
const relationKeys = (relations: Relation[]) =>
  relations.map(r => `${r.id}|${r.entityId}|${key(r.type.id)}|${key(r.fromEntity.id)}|${key(r.toEntity.id)}`).sort();

describe('refreshDebateShareCards: planning', () => {
  it('plans an update of the existing card, with what it holds now and a preview, and touches nothing', async () => {
    const id = debateId(1);
    const { deps, submit, renderAndPin } = setup(world([id], { [id]: [{ entityId: CARD_A, imageUrl: OLD }] }));

    const run = ran(await refreshDebateShareCards([id], { apply: false }, deps));

    expect(run.results).toEqual([
      {
        debateId: id,
        status: 'dry_run',
        plan: {
          debateId: id,
          debateEntityId: key(id),
          spaceId: SPACE,
          action: 'update',
          shareCardEntityIds: [CARD_A],
          currentImages: [{ entityId: CARD_A, imageUrl: OLD }],
          previewUrl: `/api/debate-og/preview?debate=${id}`,
        },
      },
    ]);
    expect(renderAndPin).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('plans a create under the id a publish mints when the debate has no card', async () => {
    const id = debateId(1);
    const { deps } = setup(world([id]));
    const run = ran(await refreshDebateShareCards([id], { apply: false }, deps));
    expect(run.results[0]).toMatchObject({
      status: 'dry_run',
      plan: { action: 'create', shareCardEntityIds: [debateShareCardEntityId(key(id))], currentImages: [] },
    });
  });

  it('skips a debate geo-chat removed, a cancelled recording, and one the graph marks Hidden', async () => {
    const removed = debateId(1);
    const cancelled = debateId(2);
    const hidden = debateId(3);
    const { deps, submit, renderAndPin } = setup(
      {
        debates: {
          [cancelled]: debateFor(cancelled, SPACE, { recording_cancelled_at: '2026-11-01T00:00:00Z' }),
          [hidden]: debateFor(hidden),
        },
      },
      {
        loadDebateEntity: async entityId =>
          entityId === key(hidden)
            ? { values: [{ property: { id: HIDDEN_PROPERTY_ID }, value: 'true' }] as never }
            : { values: [] },
      }
    );
    const run = ran(await refreshDebateShareCards([removed, cancelled, hidden], { apply: true }, deps));
    expect(run.results.map(r => [r.debateId, r.status])).toEqual([
      [removed, 'removed'],
      [cancelled, 'removed'],
      [hidden, 'removed'],
    ]);
    expect(renderAndPin).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('reports a debate geo-chat does not answer for as an error rather than removed', async () => {
    const id = debateId(1);
    const { deps } = setup(world([id]), { readVisibility: async () => ({ visibility: 'unknown', debate: null }) });
    const run = ran(await refreshDebateShareCards([id], { apply: false }, deps));
    expect(run.results[0]).toMatchObject({ debateId: id, status: 'error' });
  });

  it('reports a debate not on the graph, and one in a space the acceptor does not edit', async () => {
    const missing = debateId(1);
    const elsewhere = debateId(2);
    const { deps } = setup(
      world([missing, elsewhere], {}, id => (id === elsewhere ? OTHER_SPACE : SPACE)),
      {
        loadDebateEntity: async entityId => (entityId === key(missing) ? null : { values: [] }),
        loadEditableSpace: async spaceId =>
          spaceId === OTHER_SPACE ? null : { id: spaceId, type: 'DAO', address: '0x' },
      }
    );
    const run = ran(await refreshDebateShareCards([missing, elsewhere], { apply: false }, deps));
    expect(run.results).toEqual([
      { debateId: missing, status: 'debate_not_published' },
      { debateId: elsewhere, status: 'not_editor', spaceId: OTHER_SPACE },
    ]);
  });

  it('checks each space once however many of its debates are in the batch', async () => {
    const ids = [debateId(1), debateId(2), debateId(3)];
    const loadEditableSpace = vi.fn(async (spaceId: string) => ({ id: spaceId, type: 'DAO', address: '0x' }));
    const { deps } = setup(world(ids), { loadEditableSpace });
    await refreshDebateShareCards(ids, { apply: false }, deps);
    expect(loadEditableSpace).toHaveBeenCalledTimes(1);
  });

  it('says so when the acceptor is not configured', async () => {
    const { deps } = setup(world([debateId(1)]), { getConfig: () => null });
    expect(await refreshDebateShareCards([debateId(1)], { apply: true }, deps)).toEqual({
      status: 'acceptor_not_configured',
    });
  });
});

describe('refreshDebateShareCards: apply', () => {
  it('points the existing card at the new render, and nothing else', async () => {
    const id = debateId(1);
    const { deps, submit, prepareOps, clearCachedShareImage } = setup(
      world([id], { [id]: [{ entityId: CARD_A, imageUrl: OLD }] })
    );

    const run = ran(await refreshDebateShareCards([id], { apply: true }, deps));

    expect(run.results[0]).toMatchObject({ status: 'published', imageUrl: NEW, userOpHash: '0xhash' });
    const [values, relations, spaceId] = prepareOps.mock.calls[0];
    expect(spaceId).toBe(SPACE);
    expect(relations).toEqual([]);
    expect(valueKeys(values)).toEqual([`${CARD_A}|${key(IMAGE_URL_PROPERTY_ID)}|${NEW}`]);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0][1].name).toBe('Redraw share card: The motion | A vs. B');
    expect(clearCachedShareImage).toHaveBeenCalledWith(SPACE, key(id));
  });

  it('updates both cards of a debate published twice', async () => {
    const id = debateId(1);
    const { deps, prepareOps } = setup(
      world([id], {
        [id]: [
          { entityId: CARD_A, imageUrl: OLD },
          { entityId: CARD_B, imageUrl: OLD },
        ],
      })
    );
    ran(await refreshDebateShareCards([id], { apply: true }, deps));
    expect(valueKeys(prepareOps.mock.calls[0][0])).toEqual([
      `${CARD_A}|${key(IMAGE_URL_PROPERTY_ID)}|${NEW}`,
      `${CARD_B}|${key(IMAGE_URL_PROPERTY_ID)}|${NEW}`,
    ]);
  });

  it('gives a debate with no card the entity and relation a publish writes', async () => {
    const id = debateId(1);
    const { deps, prepareOps } = setup(world([id]));
    const run = ran(await refreshDebateShareCards([id], { apply: true }, deps));
    expect(run.results[0]).toMatchObject({ status: 'published', plan: { action: 'create' } });
    const [values, relations] = prepareOps.mock.calls[0];
    const card = debateShareCardEntityId(key(id));
    expect(valueKeys(values)).toEqual(
      [
        `${card}|${key(NAME_PROPERTY_ID)}|The motion | A vs. B | share card`,
        `${card}|${key(IMAGE_URL_PROPERTY_ID)}|${NEW}`,
      ].sort()
    );
    expect(relations.map(r => [key(r.fromEntity.id), key(r.type.id), key(r.toEntity.id)])).toEqual([
      [card, key(TYPES_PROPERTY_ID), key(IMAGE_TYPE_ID)],
      [key(id), key(OG_IMAGE_PROPERTY_ID), card],
    ]);
  });

  it('leaves a debate whose new render is the card it has, and submits nothing', async () => {
    const id = debateId(1);
    const { deps, submit, clearCachedShareImage } = setup(
      world([id], {
        [id]: [
          { entityId: CARD_A, imageUrl: NEW },
          { entityId: CARD_B, imageUrl: NEW },
        ],
      })
    );
    const run = ran(await refreshDebateShareCards([id], { apply: true }, deps));
    expect(run.results[0]).toMatchObject({ status: 'up_to_date', imageUrl: NEW });
    expect(submit).not.toHaveBeenCalled();
    expect(clearCachedShareImage).not.toHaveBeenCalled();
  });

  it('keeps the current card of a debate without stills, without rendering or submitting', async () => {
    const id = debateId(1);
    const { deps, submit, renderAndPin } = setup({
      ...world([id], { [id]: [{ entityId: CARD_A, imageUrl: OLD }] }),
      media: { [id]: NO_STILLS },
    });
    const run = ran(await refreshDebateShareCards([id], { apply: true }, deps));
    expect(run.results).toEqual([{ debateId: id, status: 'no_stills' }]);
    expect(renderAndPin).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('never renders, pins or submits on a dry run', async () => {
    const ids = [debateId(1), debateId(2)];
    const { deps, submit, renderAndPin, withLock, clearCachedShareImage } = setup(
      world(ids, { [ids[0]]: [{ entityId: CARD_A, imageUrl: OLD }] })
    );
    const run = ran(await refreshDebateShareCards(ids, { apply: false }, deps));
    expect(run.results.map(r => r.status)).toEqual(['dry_run', 'dry_run']);
    expect(renderAndPin).not.toHaveBeenCalled();
    expect(withLock).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(clearCachedShareImage).not.toHaveBeenCalled();
  });

  it('leaves a debate whose render fails out of its edit and reports it', async () => {
    const [good, bad] = [debateId(1), debateId(2)];
    const { deps, prepareOps, submit } = setup(
      world([good, bad], {
        [good]: [{ entityId: CARD_A, imageUrl: OLD }],
        [bad]: [{ entityId: CARD_B, imageUrl: OLD }],
      }),
      {
        renderAndPin: async card => {
          if ((card as unknown as { claim: string }).claim === 'boom') throw new Error('satori fell over');
          return NEW;
        },
        cardData: async (id, debate) => ({ claim: id === bad ? 'boom' : debate.claim.claim, speakers: [] as never }),
      }
    );
    const run = ran(await refreshDebateShareCards([good, bad], { apply: true }, deps));
    expect(run.results.map(r => [r.debateId, r.status])).toEqual([
      [good, 'published'],
      [bad, 'render_failed'],
    ]);
    expect(run.results[1]).toMatchObject({ error: 'satori fell over' });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(valueKeys(prepareOps.mock.calls[0][0])).toEqual([`${CARD_A}|${key(IMAGE_URL_PROPERTY_ID)}|${NEW}`]);
  });

  it('writes one edit per space per chunk, each under the signing lock', async () => {
    const inSpace = Array.from({ length: SHARE_CARD_CHUNK_SIZE + 1 }, (_, i) => debateId(i + 1));
    const elsewhere = debateId(100);
    const all = [...inSpace, elsewhere];
    const { deps, submit, prepareOps, withLock } = setup(
      world(all, {}, id => (id === elsewhere ? OTHER_SPACE : SPACE))
    );
    const run = ran(await refreshDebateShareCards(all, { apply: true }, deps));
    expect(run.results.every(r => r.status === 'published')).toBe(true);
    expect(prepareOps.mock.calls.map(([, , spaceId]) => spaceId)).toEqual([SPACE, SPACE, OTHER_SPACE]);
    expect(submit).toHaveBeenCalledTimes(3);
    expect(withLock).toHaveBeenCalledTimes(3);
    expect(submit.mock.calls[0][1].name).toBe(`Redraw the share cards of ${SHARE_CARD_CHUNK_SIZE} debates`);
  });

  it('reports every debate of an edit that failed to submit, and stops nothing else', async () => {
    const [a, b] = [debateId(1), debateId(2)];
    let calls = 0;
    const { deps } = setup(
      world([a, b], {}, id => (id === a ? SPACE : OTHER_SPACE)),
      {
        submit: (async () => {
          calls += 1;
          if (calls === 1) throw new Error('reverted');
          return '0xhash';
        }) as never,
      }
    );
    const run = ran(await refreshDebateShareCards([a, b], { apply: true }, deps));
    expect(run.results.map(r => [r.debateId, r.status])).toEqual([
      [a, 'submit_failed'],
      [b, 'published'],
    ]);
  });

  it('starts no submit past the deadline and returns what it did not reach', async () => {
    const [a, b] = [debateId(1), debateId(2)];
    let clock = 0;
    const submit = vi.fn(async () => {
      clock = SHARE_CARD_SUBMIT_DEADLINE_MS + 1;
      return '0xhash';
    });
    const { deps, renderAndPin } = setup(
      world([a, b], {}, id => (id === a ? SPACE : OTHER_SPACE)),
      {
        now: () => clock,
        submit: submit as never,
      }
    );
    const run = ran(await refreshDebateShareCards([a, b], { apply: true }, deps));
    expect(submit).toHaveBeenCalledTimes(1);
    expect(renderAndPin).toHaveBeenCalledTimes(1);
    expect(run.results.map(r => [r.debateId, r.status])).toEqual([[a, 'published']]);
    expect(run.unprocessed).toEqual([b]);
  });

  it('does not submit a chunk whose renders ran past the deadline', async () => {
    const id = debateId(1);
    let clock = 0;
    const { deps, submit } = setup(world([id]), {
      now: () => clock,
      renderAndPin: async () => {
        clock = SHARE_CARD_SUBMIT_DEADLINE_MS;
        return NEW;
      },
    });
    const run = ran(await refreshDebateShareCards([id], { apply: true }, deps));
    expect(submit).not.toHaveBeenCalled();
    expect(run.unprocessed).toEqual([id]);
    expect(run.results).toEqual([]);
  });

  it('hands back the rest when the signing lock stays busy', async () => {
    const [a, b] = [debateId(1), debateId(2)];
    const { deps, submit } = setup(
      world([a, b], {}, id => (id === a ? SPACE : OTHER_SPACE)),
      {
        withLock: (async () => ({ ran: false })) as never,
      }
    );
    const run = ran(await refreshDebateShareCards([a, b], { apply: true }, deps));
    expect(submit).not.toHaveBeenCalled();
    expect(run.acceptorBusy).toBe(true);
    expect(run.unprocessed).toEqual([a, b]);
    expect(run.results).toEqual([]);
  });

  it('keeps a published result when clearing the cached image throws', async () => {
    const id = debateId(1);
    const { deps } = setup(world([id]), {
      clearCachedShareImage: () => {
        throw new Error('no static generation store');
      },
    });
    const run = ran(await refreshDebateShareCards([id], { apply: true }, deps));
    expect(run.results[0]).toMatchObject({ status: 'published' });
  });
});

describe('shareCardEdit', () => {
  it('adds a missing card with exactly the ops the full publish writes for it', () => {
    const id = debateId(7);
    const debate = debateFor(id);
    const full = buildDebatePublishDraft({
      debateId: id,
      spaceId: SPACE,
      claimEntityId: debate.claim.claim_entity_id,
      claimText: debate.claim.claim,
      participants: debatePublishParticipants(debate),
      videoUrl: 'https://chat.example/video',
      keyframeUrl: 'https://chat.example/keyframe',
      ogImageUrl: NEW,
      transcriptTurns: [],
    });
    const card = debateShareCardEntityId(key(id));
    const fromFull = {
      values: full.values.filter(v => key(v.entity.id) === card),
      relations: full.relations.filter(
        r => key(r.fromEntity.id) === card || key(r.type.id) === key(OG_IMAGE_PROPERTY_ID)
      ),
    };
    expect(fromFull.values).toHaveLength(2);
    expect(fromFull.relations).toHaveLength(2);

    const edit = shareCardEdit({
      plan: {
        debateId: id,
        debateEntityId: key(id),
        spaceId: SPACE,
        action: 'create',
        shareCardEntityIds: [card],
        currentImages: [],
        previewUrl: '',
      },
      debate,
      imageUrl: NEW,
    });

    // Ids, endpoints and values all match; only positions are minted fresh per build.
    const strip = <T extends { position?: string }>(items: T[]) => items.map(({ position: _p, ...rest }) => rest);
    expect(edit.values).toEqual(fromFull.values);
    expect(strip(edit.relations)).toEqual(strip(fromFull.relations));
    expect(relationKeys(edit.relations)).toEqual(relationKeys(fromFull.relations));
  });
});

describe('readShareCards', () => {
  it('lists each OG Image target once, with the Image URL it holds in the space', async () => {
    const debate = key(debateId(1));
    const collect = vi.fn(async () => [
      { fromEntityId: debate, typeId: OG_IMAGE_PROPERTY_ID, toEntityId: CARD_B },
      { fromEntityId: debate, typeId: OG_IMAGE_PROPERTY_ID, toEntityId: CARD_A },
      { fromEntityId: debate, typeId: OG_IMAGE_PROPERTY_ID, toEntityId: CARD_A },
    ]);
    const readUrls = vi.fn(async () => [{ entityId: CARD_A, text: OLD }]);
    expect(await readShareCards(debate, SPACE, collect, readUrls)).toEqual([
      { entityId: CARD_A, imageUrl: OLD },
      { entityId: CARD_B, imageUrl: null },
    ]);
    expect(collect).toHaveBeenCalledWith({ fromEntityIds: [debate], typeIds: [OG_IMAGE_PROPERTY_ID], spaceId: SPACE });
    expect(readUrls).toHaveBeenCalledWith([CARD_A, CARD_B], SPACE);
  });

  it('propagates a failed read instead of reporting no card', async () => {
    const collect = async () => {
      throw new Error('graph down');
    };
    await expect(readShareCards(key(debateId(1)), SPACE, collect)).rejects.toThrow('graph down');
  });
});

describe('entityShareImagePath', () => {
  it('names the entity share image route the way Next serves it', () => {
    // The route lives under a route group, so Next suffixes it with a hash of its parent path.
    expect(ENTITY_OG_IMAGE_ROUTE_SUFFIX).toBe(djb2Hash('/space/(entity)/[id]/[entityId]').toString(36).slice(0, 6));
    expect(existsSync(path.join(__dirname, '../../../app/space/(entity)/[id]/[entityId]/opengraph-image.tsx'))).toBe(
      true
    );
    expect(entityShareImagePath(SPACE, debateId(1))).toBe(`/space/${SPACE}/${key(debateId(1))}/opengraph-image-7wh9xe`);
  });
});
