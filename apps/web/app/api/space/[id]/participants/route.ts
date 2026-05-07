import { Effect } from 'effect';
import { NextResponse } from 'next/server';

import {
  type ParticipantKind,
  SPACE_PARTICIPANTS_PAGE_SIZE,
  fetchSpaceParticipantsPage,
} from '~/core/space-members/fetch-space-participants-page';

const KINDS: ParticipantKind[] = ['members', 'editors'];

function parseKind(raw: string | null): ParticipantKind | null {
  if (raw && (KINDS as string[]).includes(raw)) return raw as ParticipantKind;
  return null;
}

function parseInt32(raw: string | null, fallback: number, { min, max }: { min: number; max: number }): number {
  if (raw == null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

const MAX_PAGE_SIZE = 100;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: spaceId } = await params;
  const { searchParams } = new URL(request.url);
  const kind = parseKind(searchParams.get('kind'));

  if (!kind) {
    return NextResponse.json({ error: 'invalid kind; expected "members" or "editors"' }, { status: 400 });
  }

  const offset = parseInt32(searchParams.get('offset'), 0, { min: 0, max: 1_000_000 });
  const limit = parseInt32(searchParams.get('limit'), SPACE_PARTICIPANTS_PAGE_SIZE, {
    min: 1,
    max: MAX_PAGE_SIZE,
  });

  try {
    const result = await Effect.runPromise(
      fetchSpaceParticipantsPage({ spaceId, kind, offset, limit })
    );
    return NextResponse.json(result);
  } catch (e) {
    console.error(`space participants ${kind}`, { spaceId, offset, limit, error: e });
    return NextResponse.json({ participants: [], totalCount: 0, nextOffset: null });
  }
}
