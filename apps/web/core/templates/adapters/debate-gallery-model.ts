import { ID } from '~/core/id';
import { NavUtils } from '~/core/utils/utils';

import type { TopicRecentDebateModel } from '../models';
import { resolveDebateStillSrc } from './use-debate-participants-batch';
import type { DebateParticipantsPair } from '~/app/api/debates/participants/route';

export function formatUnixSecDate(sec: number | undefined): string | undefined {
  if (!sec || !Number.isFinite(sec)) return undefined;
  return new Date(sec * 1000).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Parse speaker names & claim text from live Geo Debate titles, which follow either:
 * - `"Alice vs. Bob on <Claim>"`
 * - `"<Claim> | Alice vs. Bob"`
 */
export function parseDebateTitle(
  rawTitle: string,
  fallbackClaim?: string
): { claimTitle: string; speakers: [string, string] } {
  const clean = rawTitle.trim();
  const pipeMatch = clean.match(/^(.+?)\s*\|\s*(.+?)\s+vs\.?\s+(.+)$/i);
  if (pipeMatch) {
    return {
      claimTitle: fallbackClaim?.trim() || pipeMatch[1]!.trim(),
      speakers: [pipeMatch[2]!.trim(), pipeMatch[3]!.trim()],
    };
  }
  const onMatch = clean.match(/^(.+?)\s+vs\.?\s+(.+?)\s+on\s+(.+)$/i);
  if (onMatch) {
    return {
      claimTitle: fallbackClaim?.trim() || onMatch[3]!.trim(),
      speakers: [onMatch[1]!.trim(), onMatch[2]!.trim()],
    };
  }
  return {
    claimTitle: fallbackClaim?.trim() || clean,
    speakers: ['For', 'Against'],
  };
}

/** The parts of a feed row a gallery card is drawn from. */
export interface DebateGalleryRow {
  entityId: string;
  spaceId: string;
  title: string;
  createdAtSec: number;
  debateClaim?: { entityId: string; name: string | null } | null;
  debatePosters?: { slot1: string | null; slot2: string | null };
}

/**
 * A debate row as the Topic page's Recent debates card draws it (#3202): the claim it argued, both
 * speakers' stills, and their names and stances once `/api/debates/participants` answers. Until then
 * the names come from the debate's title and the stances default to Agree on top, Disagree below.
 */
export function toDebateGalleryModel(
  row: DebateGalleryRow,
  livePair: DebateParticipantsPair | undefined,
  { fallbackSpaceId, votesLabel = '' }: { fallbackSpaceId?: string; votesLabel?: string } = {}
): TopicRecentDebateModel {
  const { claimTitle, speakers } = parseDebateTitle(row.title, row.debateClaim?.name ?? undefined);
  const normDebateId = ID.uuidToHex(row.entityId).toLowerCase();

  return {
    id: row.entityId,
    claimId: row.debateClaim?.entityId ?? row.entityId,
    claimTitle,
    date: formatUnixSecDate(row.createdAtSec) ?? 'Debate',
    duration: '',
    votesLabel,
    participants: [
      {
        name: livePair?.slot1?.name ?? speakers[0],
        position: livePair?.slot1?.position ?? 'Agree',
        communityColor: '#3963fe',
        avatarUrl: resolveDebateStillSrc(row.debatePosters?.slot1, normDebateId, 1),
        profileAvatarUrl: livePair?.slot1?.avatarUrl ?? null,
      },
      {
        name: livePair?.slot2?.name ?? speakers[1],
        position: livePair?.slot2?.position ?? 'Disagree',
        communityColor: '#6833ff',
        avatarUrl: resolveDebateStillSrc(row.debatePosters?.slot2, normDebateId, 2),
        profileAvatarUrl: livePair?.slot2?.avatarUrl ?? null,
      },
    ],
    href: NavUtils.toEntity(row.spaceId || fallbackSpaceId || '', row.entityId),
  };
}

/** Where a debate's participants are filed in the batch's response. */
export function debateParticipantsKey(debateId: string): string {
  return ID.uuidToHex(debateId).toLowerCase();
}
