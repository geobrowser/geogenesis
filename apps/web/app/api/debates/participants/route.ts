import { NextResponse } from 'next/server';

import { geoChatBaseUrl } from '~/core/debates/server/geo-chat-base-url';
import { ID } from '~/core/id';
import { validateSpaceId } from '~/core/io/rest/validation';
import { resolveTemplateImageUrl } from '~/core/templates/ontology';

export const runtime = 'nodejs';

export interface DebateParticipantSummary {
  name: string;
  avatarUrl: string | null;
  position: 'Agree' | 'Disagree';
}

export interface DebateParticipantsPair {
  slot1?: DebateParticipantSummary;
  slot2?: DebateParticipantSummary;
}

interface RawParticipant {
  display_name?: string | null;
  avatar_cid?: string | null;
  participant_slot?: number | null;
  position?: boolean | null;
}

interface RawDebateResponse {
  participants?: RawParticipant[] | null;
}

const CACHE_TTL_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 3500;
const MAX_IDS = 16;

const cache = new Map<string, { value: DebateParticipantsPair; expiresAt: number }>();

async function fetchDebateParticipants(base: string, hexId: string): Promise<DebateParticipantsPair | null> {
  const now = Date.now();
  const hit = cache.get(hexId);
  if (hit && hit.expiresAt > now) {
    return hit.value;
  }

  const uuid = ID.hexToUuid(hexId);
  try {
    const res = await fetch(`${base}/debates/${encodeURIComponent(uuid)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const json = (await res.json()) as RawDebateResponse;
    const rawList = Array.isArray(json.participants) ? json.participants : [];
    const pair: DebateParticipantsPair = {};

    for (const raw of rawList) {
      const slot = raw.participant_slot;
      if (slot !== 1 && slot !== 2) continue;
      const summary: DebateParticipantSummary = {
        name: raw.display_name?.trim() || (slot === 1 ? 'Speaker 1' : 'Speaker 2'),
        avatarUrl: resolveTemplateImageUrl(raw.avatar_cid) ?? null,
        position: raw.position === false ? 'Disagree' : 'Agree',
      };
      if (slot === 1) pair.slot1 = summary;
      else pair.slot2 = summary;
    }

    cache.set(hexId, { value: pair, expiresAt: now + CACHE_TTL_MS });
    return pair;
  } catch {
    return null;
  }
}

/**
 * GET /api/debates/participants?ids=<id1>,<id2>,...
 *
 * Batch-resolves debate participant display names, profile avatars (`avatar_cid`), and true
 * Agree/Disagree stances from geo-chat server-side so debate gallery cards show accurate
 * speaker avatars and positions in both production and local dev.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const rawIds = (url.searchParams.get('ids') ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const uniqueHexIds: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawIds) {
    const canonical = validateSpaceId(raw);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    uniqueHexIds.push(canonical);
    if (uniqueHexIds.length >= MAX_IDS) break;
  }

  if (uniqueHexIds.length === 0) {
    return NextResponse.json({ participantsByDebateId: {} });
  }

  const base = geoChatBaseUrl();
  if (!base.startsWith('http://') && !base.startsWith('https://')) {
    return NextResponse.json({ participantsByDebateId: {} }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const entries = await Promise.all(
    uniqueHexIds.map(async hexId => {
      const pair = await fetchDebateParticipants(base, hexId);
      return [hexId, pair] as const;
    })
  );

  const participantsByDebateId: Record<string, DebateParticipantsPair> = {};
  for (const [hexId, pair] of entries) {
    if (pair && (pair.slot1 || pair.slot2)) {
      participantsByDebateId[hexId] = pair;
    }
  }

  return NextResponse.json(
    { participantsByDebateId },
    {
      headers: {
        'Cache-Control': 'public, max-age=600, s-maxage=600',
      },
    }
  );
}
