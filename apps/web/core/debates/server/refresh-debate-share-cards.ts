import type { Op } from '@geoprotocol/geo-sdk/lite';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';
import { revalidatePath } from 'next/cache';

import type { DebateOgCardData } from '~/core/debates/debate-og-image';
import { ID } from '~/core/id';
import { uuidToHex } from '~/core/id/normalize';
import { graphql } from '~/core/io/graphql-client';
import { getEntity } from '~/core/io/queries';
import { isHiddenEntity } from '~/core/moderation/hidden';
import type { Entity, Relation, Value } from '~/core/types';
import { mapWithConcurrency } from '~/core/utils/map-with-concurrency';
import { Publish } from '~/core/utils/publish';

import type { Debate, DebateMediaResponse } from '../api';
import {
  buildDebateShareCardDraft,
  debatePublishName,
  debateShareCardEntityId,
  debateShareCardImageUrlValue,
} from '../debate-publish-draft';
import { IMAGE_URL_PROPERTY_ID, OG_IMAGE_PROPERTY_ID } from '../ontology';
import { type DebateAcceptorConfig, getDebateAcceptorConfig } from './acceptor-config';
import { type AcceptorLockOutcome, withAcceptorLock } from './acceptor-lock';
import {
  debateShareCardData,
  hasDebateShareCardSources,
  loadDebateMedia,
  renderAndPinDebateShareCard,
} from './debate-source';
import { type DebateVisibilityRead, readDebateVisibility } from './debate-visibility';
import { loadAcceptorEditableSpace, submitEditAsAcceptor } from './publish-debate';
import { type RelationTarget, collectRelationTargets } from './relation-targets';

/**
 * GEO-3722: redraw the share card of debates that are already on the graph, in the current design.
 *
 * The publish draws a debate's card once (`buildDebateShareCard`) and writes it as an Image entity
 * the Debate points at through `OG Image`. A redesign of the card (#3118) therefore reaches only
 * debates published after it. This renders each debate's card again from geo-chat's current claim
 * text, names, avatars and stills — exactly what a fresh publish would draw — pins it, and points
 * the debate's share card at it:
 *
 * - every OG Image target the debate has in its claim space gets the new Image URL (a few debates
 *   have two cards, from the duplicate publishes of October; both are updated, neither deleted);
 * - a debate with no card at all (its stills arrived after it was published) gets the same entity
 *   and relation a publish writes, under the same derived ids ({@link buildDebateShareCardDraft});
 * - nothing else on the Debate or the card changes.
 *
 * Batched by space: debates in one claim space share one edit, at most {@link SHARE_CARD_CHUNK_SIZE}
 * per edit, so a backfill of hundreds of debates is tens of proposals rather than hundreds. Rendering
 * and pinning happen outside the acceptor signing lock; only each submit holds it, so the publish
 * sweeps are never kept waiting for a render.
 *
 * No lease and no dry-run fingerprint, unlike the late claims publish: every write here is a value
 * set on a known entity, or an entity and relation under derived ids, so running it twice, or
 * concurrently with itself, rewrites the same thing rather than adding a copy. The worst a stale
 * plan can do is set the card a second run would set anyway.
 */

/** Debates per edit. A card is a handful of ops; this bounds how much one failed proposal takes with it. */
export const SHARE_CARD_CHUNK_SIZE = 20;

/** No new submit starts after this long, so a DAO proposal, vote and execute still fit in the route's 300 s. */
export const SHARE_CARD_SUBMIT_DEADLINE_MS = 200_000;

/** Reads and renders run this many debates at a time. */
const CONCURRENCY = 4;

/** A batch read; geo-chat's anonymous by-id read is one indexed row, so this is generous. */
const VISIBILITY_TIMEOUT_MS = 10_000;

/**
 * The URL suffix Next gives `app/space/(entity)/[id]/[entityId]/opengraph-image.tsx`: a metadata
 * route under a route group gets `-<hash of its parent path>` (Next 16, `getMetadataRouteSuffix`).
 * It is what geobrowser.io's `og:image` names, and a test pins it to Next's own hash of the path, so
 * moving the route fails loudly rather than clearing nothing.
 */
export const ENTITY_OG_IMAGE_ROUTE_SUFFIX = '7wh9xe';

/** The geobrowser.io path of a debate's share image, as its entity page's `og:image` names it. */
export function entityShareImagePath(spaceId: string, entityId: string): string {
  return `/space/${uuidToHex(spaceId)}/${uuidToHex(entityId)}/opengraph-image-${ENTITY_OG_IMAGE_ROUTE_SUFFIX}`;
}

export type ShareCardImage = { entityId: string; imageUrl: string | null };

export type ShareCardPlan = {
  debateId: string;
  debateEntityId: string;
  spaceId: string;
  /** `create` when the debate has no share card in its claim space; `update` otherwise. */
  action: 'create' | 'update';
  /** The Image entities whose Image URL is set: the existing OG Image targets, or the id a publish mints. */
  shareCardEntityIds: string[];
  /** What each existing card holds now: recorded so a redraw can be rolled back by setting these again. */
  currentImages: ShareCardImage[];
  /** The redraw as it would look, rendered live (relative to the app's origin). */
  previewUrl: string;
};

export type ShareCardRefreshResult =
  | { debateId: string; status: 'dry_run'; plan: ShareCardPlan }
  | { debateId: string; status: 'published'; plan: ShareCardPlan; imageUrl: string; userOpHash: string }
  /** The new render is byte-for-byte the card it already has. Nothing submitted. */
  | { debateId: string; status: 'up_to_date'; plan: ShareCardPlan; imageUrl: string }
  /** No speaker stills (or no two speakers): the current card, if any, is left as it is. */
  | { debateId: string; status: 'no_stills' }
  /** geo-chat removed it, its recording was cancelled, or the graph marks it Hidden. Skipped. */
  | { debateId: string; status: 'removed' }
  | { debateId: string; status: 'debate_not_published' }
  | { debateId: string; status: 'not_editor'; spaceId: string }
  /** Rendering or pinning failed; the debate was left out of its edit. */
  | { debateId: string; status: 'render_failed'; plan: ShareCardPlan; error: string }
  /** The edit carrying it failed; whether it landed is unknown, and rerunning it is safe. */
  | { debateId: string; status: 'submit_failed'; plan: ShareCardPlan; imageUrl: string; error: string }
  | { debateId: string; status: 'error'; error: string };

export type ShareCardRefreshRun =
  | { status: 'acceptor_not_configured' }
  | {
      status: 'ran';
      results: ShareCardRefreshResult[];
      /** Debates not reached before the deadline, or behind a busy lock. Post them again. */
      unprocessed: string[];
      /** The signing lock was held elsewhere for too long; `unprocessed` lists what is left. */
      acceptorBusy: boolean;
    };

type AcceptorSpace = { id: string; type: string; address: string };

export type RefreshShareCardsDeps = {
  getConfig: () => DebateAcceptorConfig | null;
  readVisibility: (debateEntityId: string) => Promise<DebateVisibilityRead>;
  /** The Debate entity in its claim space, or null when it is not on the graph. */
  loadDebateEntity: (debateEntityId: string, spaceId: string) => Promise<Pick<Entity, 'values'> | null>;
  loadMedia: (debateId: string) => Promise<DebateMediaResponse>;
  /** The debate's OG Image targets in the space, and the Image URL each holds there. */
  readShareCards: (debateEntityId: string, spaceId: string) => Promise<ShareCardImage[]>;
  loadEditableSpace: (spaceId: string, config: DebateAcceptorConfig, debateId: string) => Promise<AcceptorSpace | null>;
  cardData: (debateId: string, debate: Debate, media: DebateMediaResponse) => Promise<DebateOgCardData | null>;
  /** Render and pin; the `ipfs://` URI. */
  renderAndPin: (card: DebateOgCardData) => Promise<string>;
  prepareOps: (values: Value[], relations: Relation[], spaceId: string) => Promise<Op[]>;
  submit: typeof submitEditAsAcceptor;
  withLock: <T>(fn: () => Promise<T>, waitMs: number) => Promise<AcceptorLockOutcome<T>>;
  /** Drop geobrowser.io's cached share image of one debate page. */
  clearCachedShareImage: (spaceId: string, debateEntityId: string) => void;
  now: () => number;
};

const defaultDeps: RefreshShareCardsDeps = {
  getConfig: getDebateAcceptorConfig,
  readVisibility: id => readDebateVisibility(id, { timeoutMs: VISIBILITY_TIMEOUT_MS }),
  loadDebateEntity: (id, spaceId) => Effect.runPromise(getEntity(id, spaceId)),
  loadMedia: loadDebateMedia,
  readShareCards,
  loadEditableSpace: loadAcceptorEditableSpace,
  cardData: debateShareCardData,
  renderAndPin: renderAndPinDebateShareCard,
  prepareOps: (values, relations, spaceId) =>
    Effect.runPromise(Publish.prepareLocalDataForPublishing(values, relations, spaceId)),
  submit: submitEditAsAcceptor,
  withLock: (fn, waitMs) =>
    withAcceptorLock(fn, { ttlMs: SHARE_CARD_SUBMIT_DEADLINE_MS + 100_000, waitMs: Math.max(0, waitMs) }),
  clearCachedShareImage: (spaceId, debateEntityId) => revalidatePath(entityShareImagePath(spaceId, debateEntityId)),
  now: Date.now,
};

type Planned = { plan: ShareCardPlan; debate: Debate; media: DebateMediaResponse; space: AcceptorSpace };

/**
 * Plan (dry run) or redraw (`apply`) the share cards of `debateIds`. A dry run renders, pins and
 * submits nothing. Per-debate failures are reported in `results` and never stop the batch.
 */
export async function refreshDebateShareCards(
  debateIds: string[],
  { apply }: { apply: boolean },
  deps: Partial<RefreshShareCardsDeps> = {}
): Promise<ShareCardRefreshRun> {
  const d = { ...defaultDeps, ...deps };
  const config = d.getConfig();
  if (!config) return { status: 'acceptor_not_configured' };
  const startedAt = d.now();
  const pastDeadline = () => d.now() - startedAt >= SHARE_CARD_SUBMIT_DEADLINE_MS;

  // One editor check per space, however many of its debates are in the batch.
  const spaces = new Map<string, Promise<AcceptorSpace | null>>();
  const editableSpace = (spaceId: string, debateId: string) => {
    const key = uuidToHex(spaceId);
    let space = spaces.get(key);
    if (!space) {
      space = d.loadEditableSpace(spaceId, config, debateId);
      spaces.set(key, space);
    }
    return space;
  };

  const planned = await mapWithConcurrency(debateIds, CONCURRENCY, async debateId => {
    try {
      return await planShareCard(debateId, d, editableSpace);
    } catch (error) {
      console.error(`[debate-acceptor] share card redraw could not plan debate ${debateId}:`, error);
      return { debateId, status: 'error', error: errorMessage(error) } as const;
    }
  });

  const results = new Map<string, ShareCardRefreshResult>();
  const ready: Planned[] = [];
  for (const outcome of planned) {
    if ('plan' in outcome && 'space' in outcome) {
      if (apply) ready.push(outcome);
      else
        results.set(outcome.plan.debateId, { debateId: outcome.plan.debateId, status: 'dry_run', plan: outcome.plan });
    } else {
      results.set(outcome.debateId, outcome);
    }
  }

  const unprocessed: string[] = [];
  let acceptorBusy = false;
  const chunks = chunkBySpace(ready);
  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    if (acceptorBusy || pastDeadline()) {
      unprocessed.push(...chunk.map(p => p.plan.debateId));
      continue;
    }

    // Render and pin outside the lock: this is the slow part, and the sweeps sign with the same account.
    const rendered = await mapWithConcurrency(chunk, CONCURRENCY, async p => {
      try {
        const card = await d.cardData(p.plan.debateId, p.debate, p.media);
        if (!card) {
          results.set(p.plan.debateId, { debateId: p.plan.debateId, status: 'no_stills' });
          return null;
        }
        return { ...p, imageUrl: await d.renderAndPin(card) };
      } catch (error) {
        console.error(`[debate-acceptor] share card redraw could not render debate ${p.plan.debateId}:`, error);
        results.set(p.plan.debateId, {
          debateId: p.plan.debateId,
          status: 'render_failed',
          plan: p.plan,
          error: errorMessage(error),
        });
        return null;
      }
    });

    const changed: Array<Planned & { imageUrl: string }> = [];
    for (const item of rendered) {
      if (!item) continue;
      const { plan, imageUrl } = item;
      if (plan.action === 'update' && plan.currentImages.every(image => image.imageUrl === imageUrl)) {
        results.set(plan.debateId, { debateId: plan.debateId, status: 'up_to_date', plan, imageUrl });
      } else {
        changed.push(item);
      }
    }
    if (changed.length === 0) continue;
    if (pastDeadline()) {
      unprocessed.push(...changed.map(p => p.plan.debateId));
      continue;
    }

    const spaceId = changed[0].plan.spaceId;
    const space = changed[0].space;
    const draft = changed.map(item => shareCardEdit(item));
    try {
      const ops = await d.prepareOps(
        draft.flatMap(e => e.values),
        draft.flatMap(e => e.relations),
        spaceId
      );
      if (ops.length === 0) throw new Error(`Share card redraw in space ${spaceId} resolved to an empty edit.`);
      const name = editName(changed);
      const remainingMs = SHARE_CARD_SUBMIT_DEADLINE_MS - (d.now() - startedAt);
      const outcome = await d.withLock(() => d.submit(config, { name, ops, space }), Math.min(60_000, remainingMs));
      if (!outcome.ran) {
        acceptorBusy = true;
        unprocessed.push(...changed.map(p => p.plan.debateId));
        continue;
      }
      for (const item of changed) {
        const { plan, imageUrl } = item;
        results.set(plan.debateId, {
          debateId: plan.debateId,
          status: 'published',
          plan,
          imageUrl,
          userOpHash: outcome.value,
        });
        console.log('[debate-acceptor] redrew debate share card', {
          debateId: plan.debateId,
          spaceId,
          action: plan.action,
          shareCardEntityIds: plan.shareCardEntityIds,
          previousImageUrls: plan.currentImages.map(image => image.imageUrl),
          imageUrl,
          userOpHash: outcome.value,
        });
        try {
          d.clearCachedShareImage(spaceId, plan.debateEntityId);
        } catch (error) {
          // The card is on the graph either way; a cached image only lags until it expires.
          console.warn(`[debate-acceptor] could not clear the cached share image of ${plan.debateId}`, error);
        }
      }
    } catch (error) {
      console.error(`[debate-acceptor] share card redraw edit failed in space ${spaceId}:`, error);
      for (const { plan, imageUrl } of changed) {
        results.set(plan.debateId, {
          debateId: plan.debateId,
          status: 'submit_failed',
          plan,
          imageUrl,
          error: errorMessage(error),
        });
      }
    }
  }

  const left = new Set(unprocessed);
  return {
    status: 'ran',
    results: debateIds.flatMap(id => {
      const result = results.get(id);
      return result && !left.has(id) ? [result] : [];
    }),
    unprocessed,
    acceptorBusy,
  };
}

async function planShareCard(
  debateId: string,
  d: RefreshShareCardsDeps,
  editableSpace: (spaceId: string, debateId: string) => Promise<AcceptorSpace | null>
): Promise<Planned | ShareCardRefreshResult> {
  const debateEntityId = ID.uuidToHex(debateId);

  // geo-chat first: a removed debate's card already reads as the generic one, and must not be redrawn.
  const visibility = await d.readVisibility(debateEntityId);
  if (visibility.visibility === 'removed') return { debateId, status: 'removed' };
  if (visibility.visibility !== 'visible' || !visibility.debate) {
    throw new Error(`geo-chat did not answer for debate ${debateId}; try again.`);
  }
  const debate = visibility.debate;
  if (debate.recording_cancelled_at) return { debateId, status: 'removed' };
  const spaceId = debate.claim.space_id;

  const entity = await d.loadDebateEntity(debateEntityId, spaceId);
  if (!entity) return { debateId, status: 'debate_not_published' };
  if (isHiddenEntity(entity)) return { debateId, status: 'removed' };

  const media = await d.loadMedia(debateId);
  if (!hasDebateShareCardSources(debate, media)) return { debateId, status: 'no_stills' };

  const current = await d.readShareCards(debateEntityId, spaceId);
  const space = await editableSpace(spaceId, debateId);
  if (!space) return { debateId, status: 'not_editor', spaceId };

  const plan: ShareCardPlan = {
    debateId,
    debateEntityId,
    spaceId,
    action: current.length === 0 ? 'create' : 'update',
    shareCardEntityIds:
      current.length === 0 ? [debateShareCardEntityId(debateEntityId)] : current.map(image => image.entityId),
    currentImages: current,
    previewUrl: `/api/debate-og/preview?debate=${debateId}`,
  };
  return { plan, debate, media, space };
}

/** Planned debates grouped by claim space, in order of first appearance, cut into edits. */
function chunkBySpace<T extends { plan: ShareCardPlan }>(items: T[]): T[][] {
  const bySpace = new Map<string, T[]>();
  for (const item of items) {
    const key = uuidToHex(item.plan.spaceId);
    bySpace.set(key, [...(bySpace.get(key) ?? []), item]);
  }
  const chunks: T[][] = [];
  for (const list of bySpace.values()) {
    for (let i = 0; i < list.length; i += SHARE_CARD_CHUNK_SIZE) chunks.push(list.slice(i, i + SHARE_CARD_CHUNK_SIZE));
  }
  return chunks;
}

/** What one debate's redraw writes. */
export function shareCardEdit({ plan, debate, imageUrl }: { plan: ShareCardPlan; debate: Debate; imageUrl: string }): {
  values: Value[];
  relations: Relation[];
} {
  if (plan.action === 'create') {
    const { values, relations } = buildDebateShareCardDraft({
      debateId: debate.id,
      spaceId: plan.spaceId,
      claimText: debate.claim.claim,
      participants: publishParticipants(debate),
      imageUrl,
    });
    return { values, relations };
  }
  return {
    values: plan.shareCardEntityIds.map(shareCardEntityId =>
      debateShareCardImageUrlValue({ shareCardEntityId, spaceId: plan.spaceId, imageUrl })
    ),
    relations: [],
  };
}

function publishParticipants(debate: Debate) {
  return debate.participants.map(p => ({
    spaceEntityId: p.profile_space_id,
    displayName: p.display_name,
    position: p.position,
    participantSlot: p.participant_slot,
  }));
}

function editName(items: Array<{ debate: Debate }>): string {
  if (items.length === 1) {
    const [{ debate }] = items;
    return `Redraw share card: ${debatePublishName(debate.claim.claim, publishParticipants(debate))}`;
  }
  return `Redraw the share cards of ${items.length} debates`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const SHARE_CARD_URLS_SOURCE = /* GraphQL */ `
  query DebateShareCardUrls($ids: [UUID!]!, $propertyId: UUID!, $spaceId: UUID!, $first: Int!) {
    values(
      first: $first
      filter: { entityId: { in: $ids }, propertyId: { is: $propertyId }, spaceId: { is: $spaceId } }
    ) {
      entityId
      text
    }
  }
`;

type ShareCardUrlsQuery = { values: Array<{ entityId: string | null; text: string | null } | null> | null };

const shareCardUrlsDocument = parse(SHARE_CARD_URLS_SOURCE) as TypedDocumentNode<
  ShareCardUrlsQuery,
  { ids: string[]; propertyId: string; spaceId: string; first: number }
>;

/**
 * The debate's share cards in the space: each OG Image target and the Image URL it holds there
 * (null when it holds none). Throws on a failed read, which must never look like "no card": that
 * would add a second one.
 */
export async function readShareCards(
  debateEntityId: string,
  spaceId: string,
  collect: (
    request: Parameters<typeof collectRelationTargets>[0]
  ) => Promise<RelationTarget[]> = collectRelationTargets,
  readUrls: (ids: string[], spaceId: string) => Promise<ShareCardUrlsQuery> = readShareCardUrls
): Promise<ShareCardImage[]> {
  const links = await collect({ fromEntityIds: [debateEntityId], typeIds: [OG_IMAGE_PROPERTY_ID], spaceId });
  const targets = [
    ...new Set(
      links
        .filter(
          link =>
            uuidToHex(link.fromEntityId) === uuidToHex(debateEntityId) &&
            uuidToHex(link.typeId) === uuidToHex(OG_IMAGE_PROPERTY_ID)
        )
        .map(link => uuidToHex(link.toEntityId))
    ),
  ].sort();
  if (targets.length === 0) return [];
  const data = await readUrls(targets, spaceId);
  const urlById = new Map<string, string>();
  for (const value of data.values ?? []) {
    if (value?.entityId && value.text) urlById.set(uuidToHex(value.entityId), value.text);
  }
  return targets.map(entityId => ({ entityId, imageUrl: urlById.get(entityId) ?? null }));
}

function readShareCardUrls(ids: string[], spaceId: string): Promise<ShareCardUrlsQuery> {
  return Effect.runPromise(
    graphql({
      query: shareCardUrlsDocument,
      decoder: response => response,
      variables: { ids, propertyId: IMAGE_URL_PROPERTY_ID, spaceId, first: 100 },
    })
  );
}
