import { Position } from '@geoprotocol/geo-sdk/lite';

import { NAME_PROPERTY_ID } from '~/core/debates/ontology';
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
};

export type DebateTranscriptClaims = {
  /** Every claim, deduped, in transcript order. */
  all: TranscriptClaim[];
  /** Claims keyed by the hex form of the speaker's `profile_space_id`. */
  byAuthorSpaceId: Map<string, TranscriptClaim[]>;
  /** Claims on a block with no `Authors` relation. Empty for anything we publish. */
  unattributed: TranscriptClaim[];
  totalCount: number;
};

export const EMPTY_TRANSCRIPT_CLAIMS: DebateTranscriptClaims = {
  all: [],
  byAuthorSpaceId: new Map(),
  unattributed: [],
  totalCount: 0,
};

type PresentRelation<T> = { position?: string | null; toEntity: T };

/**
 * Drop relations the API returned as null (or pointing at nothing) and put the rest in graph
 * order. `relationsList` does not come back sorted by `position`, so ordering has to happen here
 * for claims to read in transcript order.
 */
function presentRelations<T>(
  relations: Array<{ position?: string | null; toEntity: T | null } | null> | null | undefined
): PresentRelation<T>[] {
  const present: PresentRelation<T>[] = [];

  for (const relation of relations ?? []) {
    if (relation?.toEntity) present.push({ position: relation.position, toEntity: relation.toEntity });
  }

  return present.sort((a, b) => Position.compare(a.position ?? null, b.position ?? null));
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
 * A claim id is kept once, under the first block that carries it: the graph can return the same
 * relation twice (duplicate publishes do happen), and a claim repeated across two of a speaker's
 * turns should still be one row. Deduping globally rather than per-block also means a claim quoted
 * by both debaters is attributed to whoever said it first rather than counted twice.
 */
export function groupTranscriptClaims(data: DebateTranscriptClaimsQuery, spaceId: string): DebateTranscriptClaims {
  const all: TranscriptClaim[] = [];
  const byAuthorSpaceId = new Map<string, TranscriptClaim[]>();
  const unattributed: TranscriptClaim[] = [];
  const seenClaimIds = new Set<string>();

  for (const transcript of presentRelations(data.entity?.transcripts)) {
    for (const block of presentRelations(transcript.toEntity.blocks)) {
      const blockEntity = block.toEntity;

      // A block should have exactly one author; take the first if the graph ever holds more, so
      // one turn's claims land in one group rather than being counted under each speaker.
      const authorSpaceId = presentRelations(blockEntity.authors)[0]?.toEntity.id;

      for (const claim of presentRelations(blockEntity.claims)) {
        const claimEntity = claim.toEntity;
        const key = uuidToHex(claimEntity.id);
        if (seenClaimIds.has(key)) continue;

        const resolved = resolveClaimNaming(claimEntity, spaceId);
        // A claim with no name has nothing to render — its text *is* its name.
        if (!resolved.text) continue;

        seenClaimIds.add(key);

        const row: TranscriptClaim = { id: claimEntity.id, text: resolved.text, spaceId: resolved.spaceId };

        all.push(row);

        if (!authorSpaceId) {
          unattributed.push(row);
          continue;
        }

        const authorKey = uuidToHex(authorSpaceId);
        const existing = byAuthorSpaceId.get(authorKey);
        if (existing) existing.push(row);
        else byAuthorSpaceId.set(authorKey, [row]);
      }
    }
  }

  return { all, byAuthorSpaceId, unattributed, totalCount: all.length };
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

  const claimed = new Set<string>();
  for (const [authorSpaceId, rows] of claims.byAuthorSpaceId) {
    if (known.has(authorSpaceId)) for (const row of rows) claimed.add(uuidToHex(row.id));
  }

  // Filtered out of the flat list rather than assembled from the author map: walking the map would
  // emit one unknown author's claims together and then every unattributed one after them, so an
  // A/B/A transcript came out A/A/B. `all` is already in transcript order, which is the order this
  // is documented to fall back to.
  return claims.all.filter(claim => !claimed.has(uuidToHex(claim.id)));
}

/** The claims a given participant made, in transcript order. */
export function claimsForParticipant(claims: DebateTranscriptClaims, profileSpaceId: string): TranscriptClaim[] {
  return claims.byAuthorSpaceId.get(uuidToHex(profileSpaceId)) ?? [];
}
