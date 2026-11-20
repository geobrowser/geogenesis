import { sharePlayerCardResponse } from '~/core/debates/server/share-player-card';

export const runtime = 'nodejs';

/** The debate's landscape share image, cut from its share video's first frame (GEO-3817). Previews only. */
export async function GET(_request: Request, context: { params: Promise<{ spaceId: string; debateId: string }> }) {
  return sharePlayerCardResponse(await context.params);
}
