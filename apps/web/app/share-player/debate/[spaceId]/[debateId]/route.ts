import { sharePlayerResponse } from '~/core/debates/server/share-player';

/**
 * The page X frames in a debate's player card, and a shareable URL in its own right with the vertical
 * poster as its unfurl image (GEO-3817). Preview deployments only.
 */
export async function GET(request: Request, context: { params: Promise<{ spaceId: string; debateId: string }> }) {
  return sharePlayerResponse({ ...(await context.params), origin: new URL(request.url).origin });
}
