import { Position } from '@geoprotocol/geo-sdk/lite';

import {
  CLAIM_END_OFFSET_PROPERTY_ID,
  CLAIM_START_OFFSET_PROPERTY_ID,
  NAME_PROPERTY_ID,
} from '~/core/debates/ontology';
import { uuidToHex } from '~/core/id/normalize';
import { entityHomeSpaceId } from '~/core/utils/space/entity-home-space';

import type { DebateTranscriptClaimsQuery } from '../io/debate-transcript-claims-document';

/** One claim extracted from a turn of a debate. */
export type TranscriptClaim = {
  id: string;
  /** The claim sentence. Claim entities carry it as their name. */
  text: string;
  /**
   * The space the claim lives in, which is where its responses are published — not necessarily
   * the space the panel is rendered from. Null when the graph reports none, which leaves the
   * claim unlinkable and unrespondable rather than pointing it at the wrong space.
   */
  spaceId: string | null;
  /**
   * The transcript block this claim was first seen on — the turn it was said in.
   *
   * Carried so `claim-timing.ts` can place the claim inside that turn's slice of the recording
   * rather than searching the whole debate, which is both slower and a way to match a phrase the
   * other debater said.
   */
  blockId: string;
  /**
   * The claim's timecodes as published on the block → claim relation entity, in milliseconds from
   * the start of the debate timeline. Null for every debate published before timecodes existed,
   * which is nearly all of them — the resolver recovers those from the transcript instead.
   */
  publishedTiming: { startMs: number; endMs: number } | null;
  /**
   * The id of the block → claim relation's own entity, which is where {@link publishedTiming} is
   * read from and where a backfill writes it.
   *
   * From the same relation as {@link blockId} — the turn the claim was first seen on — so the two
   * always describe the same statement. Null only if the API omits it.
   */
  relationEntityId: string | null;
};

/** One turn of the debate as published, with the text needed to locate it on the recording. */
export type TranscriptBlock = {
  id: string;
  /** The speaker's personal-space id, or null on a block with no `Authors` relation. */
  authorSpaceId: string | null;
  /** The turn's verbatim text, in transcript order within the turn. */
  text: string;
};

export type DebateTranscriptClaims = {
  /**
   * Every claim, deduped, in the order the graph returned them.
   *
   * Not chronological, despite how it reads: relations are published with `Position.generate()`,
   * which is random rather than monotonic, so `position` order is arbitrary. `claim-timing.ts`
   * recovers the real order from the recording. See {@link groupTranscriptClaims}.
   */
  all: TranscriptClaim[];
  /** Claims keyed by the hex form of the speaker's `profile_space_id`. */
  byAuthorSpaceId: Map<string, TranscriptClaim[]>;
  /** Claims on a block with no `Authors` relation. Empty for anything we publish. */
  unattributed: TranscriptClaim[];
  /** The debate's turns, in the same arbitrary order, keyed by block id. */
  blocks: TranscriptBlock[];
  totalCount: number;
};

export const EMPTY_TRANSCRIPT_CLAIMS: DebateTranscriptClaims = {
  all: [],
  byAuthorSpaceId: new Map(),
  unattributed: [],
  blocks: [],
  totalCount: 0,
};

type PresentRelation<T, E = unknown> = {
  position?: string | null;
  entityId?: string | null;
  entity?: E;
  toEntity: T;
};

/**
 * Drop relations the API returned as null (or pointing at nothing) and put the rest in `position`
 * order.
 *
 * This is a stable order, not a chronological one. Every relation here was published with
 * `Position.generate()`, which is random rather than monotonic, so sorting by it produces the same
 * arbitrary sequence on every read rather than the order the turns were spoken in. That is enough
 * for grouping and dedupe, which is all this function feeds; anything that needs real order takes
 * it from `claim-timing.ts`.
 *
 * The relation's own `entity` and `entityId` are carried through, because on a block → claim
 * relation that entity is where the claim's timecodes live and its id is where a backfill writes
 * them.
 */
function presentRelations<T, E = unknown>(
  relations:
    | Array<{ position?: string | null; entityId?: string | null; entity?: E; toEntity: T | null } | null>
    | null
    | undefined
): PresentRelation<T, E>[] {
  const present: PresentRelation<T, E>[] = [];

  for (const relation of relations ?? []) {
    if (relation?.toEntity) {
      present.push({
        position: relation.position,
        entityId: relation.entityId,
        entity: relation.entity,
        toEntity: relation.toEntity,
      });
    }
  }

  return present.sort((a, b) => Position.compare(a.position ?? null, b.position ?? null));
}

/** The turn's text as published in this space, or '' when the graph holds none. */
function blockTextInSpace(
  markdown: Array<{ spaceId: string; text?: string | null } | null> | null | undefined,
  spaceId: string
): string {
  for (const value of markdown ?? []) {
    if (!value || typeof value.text !== 'string') continue;
    if (uuidToHex(value.spaceId) === uuidToHex(spaceId)) return value.text.trim();
  }
  return '';
}

/**
 * The timecodes published on a block → claim relation entity, or null when it carries none.
 *
 * Integer values arrive as strings, so they are parsed rather than trusted. A pair that is
 * incomplete, unparseable, negative, or not strictly increasing is discarded whole: a half-answer
 * here would be drawn as a real moment on the timeline, and falling back to matching is both
 * honest and usually right.
 */
function publishedTiming(
  values: Array<{ propertyId: string; integer?: string | null } | null> | null | undefined
): { startMs: number; endMs: number } | null {
  let startMs: number | null = null;
  let endMs: number | null = null;

  for (const value of values ?? []) {
    if (!value || value.integer === null || value.integer === undefined) continue;
    const parsed = Number(value.integer);
    if (!Number.isFinite(parsed)) continue;
    if (uuidToHex(value.propertyId) === uuidToHex(CLAIM_START_OFFSET_PROPERTY_ID)) startMs = parsed;
    if (uuidToHex(value.propertyId) === uuidToHex(CLAIM_END_OFFSET_PROPERTY_ID)) endMs = parsed;
  }

  if (startMs === null || endMs === null) return null;
  if (startMs < 0 || endMs <= startMs) return null;

  return { startMs, endMs };
}

type ClaimEntityNaming = {
  name?: string | null;
  spaceIds?: Array<string | null> | null;
  names?: Array<{ spaceId: string; text?: string | null } | null> | null;
};

/**
 * The sentence to show for a claim and the space its row belongs to, both read per space.
 *
 * The sentence cannot come from the relation's aggregated `toEntity.name`: that field merges every
 * space, which `core/io/dto/relations.ts` says in as many words and works around the same way. Left
 * alone it would let a Name published for this claim in an unrelated space rewrite what a debater is
 * shown to have said — the cross-space attribution the relation filters exist to prevent, arriving
 * through the text instead of the link.
 *
 * The space cannot come from `spaceIds[0]` either. `entity-home-space.ts` documents that the list
 * counts every space holding a value *or an outbound relation*, so its first entry can be a space
 * that merely cites the claim. Home-space resolution is deferred to that module rather than
 * reimplemented, so this follows the same rule as the entity side panel and the data block rows.
 *
 * The debate's own space wins whenever the claim is named there, which it is for anything we
 * published. Everything else is the documented fallback for a claim linked in from elsewhere.
 */
function resolveClaimNaming(claim: ClaimEntityNaming, debateSpaceId: string): { text: string; spaceId: string | null } {
  const named = (claim.names ?? []).flatMap(value =>
    value && typeof value.text === 'string' && value.text.trim().length > 0
      ? [{ spaceId: value.spaceId, text: value.text.trim() }]
      : []
  );

  const inDebateSpace = named.find(value => uuidToHex(value.spaceId) === uuidToHex(debateSpaceId));
  if (inDebateSpace) return { text: inDebateSpace.text, spaceId: debateSpaceId };

  const homeSpaceId = entityHomeSpaceId({
    spaces: (claim.spaceIds ?? []).filter((id): id is string => typeof id === 'string'),
    values: named.map(value => ({ property: { id: NAME_PROPERTY_ID }, spaceId: value.spaceId, value: value.text })),
  });

  const atHome = homeSpaceId ? named.find(value => uuidToHex(value.spaceId) === uuidToHex(homeSpaceId)) : undefined;

  return { text: (atHome?.text ?? claim.name?.trim() ?? '').trim(), spaceId: homeSpaceId };
}

/**
 * Flatten the transcript traversal into claims grouped by the speaker who made them.
 *
 * Relations are sorted by `position` rather than trusted in list order, so claims read in
 * transcript order inside each speaker's group.
 *
 * A claim id appears once in `all`, at its first block: the graph can return the same relation twice
 * (duplicate publishes do happen), and a claim repeated across two of a speaker's turns should still
 * be one row and one count. Per speaker the unit is the (speaker, claim) pair, so a claim both
 * debaters stated is listed under each of them. That used to be a rare quotation; with
 * find-or-create it is the ordinary case, because a transcript claim that already exists in the
 * space is linked to the existing entity instead of minted again, and dropping the second speaker's
 * row would silently erase what they said.
 */
export function groupTranscriptClaims(data: DebateTranscriptClaimsQuery, spaceId: string): DebateTranscriptClaims {
  const all: TranscriptClaim[] = [];
  const byAuthorSpaceId = new Map<string, TranscriptClaim[]>();
  const unattributed: TranscriptClaim[] = [];
  const blocks: TranscriptBlock[] = [];
  const rowsByClaimId = new Map<string, TranscriptClaim>();
  /** `${authorKey}:${claimKey}`; the empty author key stands for unattributed. */
  const seenPairs = new Set<string>();

  for (const transcript of presentRelations(data.entity?.transcripts)) {
    for (const block of presentRelations(transcript.toEntity.blocks)) {
      const blockEntity = block.toEntity;

      // A block should have exactly one author; take the first if the graph ever holds more, so
      // one turn's claims land in one group rather than being counted under each speaker.
      const authorSpaceId = presentRelations(blockEntity.authors)[0]?.toEntity.id;

      blocks.push({
        id: blockEntity.id,
        authorSpaceId: authorSpaceId ?? null,
        text: blockTextInSpace(blockEntity.markdown, spaceId),
      });

      for (const claim of presentRelations(blockEntity.claims)) {
        const claimEntity = claim.toEntity;
        const key = uuidToHex(claimEntity.id);

        let row = rowsByClaimId.get(key);
        if (!row) {
          const resolved = resolveClaimNaming(claimEntity, spaceId);
          // A claim with no name has nothing to render — its text *is* its name.
          if (!resolved.text) continue;
          row = {
            id: claimEntity.id,
            text: resolved.text,
            spaceId: resolved.spaceId,
            blockId: blockEntity.id,
            publishedTiming: publishedTiming(claim.entity?.valuesList),
            relationEntityId: claim.entityId ?? null,
          };
          rowsByClaimId.set(key, row);
          all.push(row);
        }

        const authorKey = authorSpaceId ? uuidToHex(authorSpaceId) : '';
        const pairKey = `${authorKey}:${key}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        if (!authorSpaceId) {
          unattributed.push(row);
          continue;
        }

        const existing = byAuthorSpaceId.get(authorKey);
        if (existing) existing.push(row);
        else byAuthorSpaceId.set(authorKey, [row]);
      }
    }
  }

  return { all, byAuthorSpaceId, unattributed, blocks, totalCount: all.length };
}

/**
 * Claims whose speaker isn't among the debate's participants, plus any that had no author at all.
 *
 * Attribution comes from the graph and the participant list from geo-chat, so the two can disagree
 * — a debate republished after a participant record changed, say. The panel renders these under a
 * catch-all row instead of dropping them, since a silently short list reads as "these are all the
 * claims" when it isn't.
 */
export function unmatchedClaims(claims: DebateTranscriptClaims, participantSpaceIds: string[]): TranscriptClaim[] {
  const known = new Set(participantSpaceIds.map(uuidToHex));

  // The unit is the statement — an (author, claim) pair — not the claim. With reuse one claim can
  // be stated by a participant and by an author outside the list; the participant's row does not
  // cover the other statement, which would otherwise vanish from the panel.
  const unmatched = new Set<string>();
  for (const [authorSpaceId, rows] of claims.byAuthorSpaceId) {
    if (!known.has(authorSpaceId)) for (const row of rows) unmatched.add(uuidToHex(row.id));
  }
  for (const row of claims.unattributed) unmatched.add(uuidToHex(row.id));

  // Filtered out of the flat list rather than assembled from the author map: walking the map would
  // emit one unknown author's claims together and then every unattributed one after them, so an
  // A/B/A transcript came out A/A/B. `all` is already in transcript order, which is the order this
  // is documented to fall back to.
  return claims.all.filter(claim => unmatched.has(uuidToHex(claim.id)));
}

/** The claims a given participant made, in transcript order. */
export function claimsForParticipant(claims: DebateTranscriptClaims, profileSpaceId: string): TranscriptClaim[] {
  return claims.byAuthorSpaceId.get(uuidToHex(profileSpaceId)) ?? [];
}
