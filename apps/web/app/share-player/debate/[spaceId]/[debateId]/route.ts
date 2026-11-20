import { sharePlayerResponse } from '~/core/debates/server/share-player';

/** The page X frames in a debate's player card (GEO-3817). Preview deployments only. */
export async function GET(_request: Request, context: { params: Promise<{ spaceId: string; debateId: string }> }) {
  return sharePlayerResponse(await context.params);
}
