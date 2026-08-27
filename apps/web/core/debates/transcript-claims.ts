import { Position } from '@geoprotocol/geo-sdk/lite';

import { uuidToHex } from '~/core/id/normalize';

import type { DebateTranscriptClaimsQuery } from '../io/debate-transcript-claims-document';

/** One claim extracted from a turn of a debate. */
export type TranscriptClaim = {
  id: string;
  /** The claim sentence. Claim entities carry it as their name. */
  text: string;
};

export type DebateTranscriptClaims = {
  /** Claims keyed by the hex form of the speaker's `profile_space_id`. */
  byAuthorSpaceId: Map<string, TranscriptClaim[]>;
  /** Claims on a block with no `Authors` relation. Empty for anything we publish. */
  unattributed: TranscriptClaim[];
  totalCount: number;
};

export const EMPTY_TRANSCRIPT_CLAIMS: DebateTranscriptClaims = {
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
export function groupTranscriptClaims(data: DebateTranscriptClaimsQuery): DebateTranscriptClaims {
  const byAuthorSpaceId = new Map<string, TranscriptClaim[]>();
  const unattributed: TranscriptClaim[] = [];
  const seenClaimIds = new Set<string>();
  let totalCount = 0;

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

        // A claim with no name has nothing to render — its text *is* its name.
        const text = claimEntity.name?.trim();
        if (!text) continue;

        seenClaimIds.add(key);
        totalCount += 1;

        const row: TranscriptClaim = { id: claimEntity.id, text };

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

  return { byAuthorSpaceId, unattributed, totalCount };
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
  const orphaned = [...claims.byAuthorSpaceId.entries()]
    .filter(([authorSpaceId]) => !known.has(authorSpaceId))
    .flatMap(([, rows]) => rows);

  return [...orphaned, ...claims.unattributed];
}

/** The claims a given participant made, in transcript order. */
export function claimsForParticipant(claims: DebateTranscriptClaims, profileSpaceId: string): TranscriptClaim[] {
  return claims.byAuthorSpaceId.get(uuidToHex(profileSpaceId)) ?? [];
}
