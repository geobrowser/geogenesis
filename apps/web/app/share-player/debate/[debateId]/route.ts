import { isGeoChatDebateId } from '~/core/debates/debate-removal';
import { sharePlayerEnabled, sharePlayerHtml } from '~/core/debates/server/share-player';

/** The page X frames in a debate's player card (GEO-3817). Preview deployments only. */
export async function GET(_request: Request, context: { params: Promise<{ debateId: string }> }) {
  const { debateId } = await context.params;
  if (!sharePlayerEnabled() || !isGeoChatDebateId(debateId)) {
    return new Response('Not found', { status: 404 });
  }
  return new Response(sharePlayerHtml({ debateId, title: 'Geo debate' }), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' },
  });
}
