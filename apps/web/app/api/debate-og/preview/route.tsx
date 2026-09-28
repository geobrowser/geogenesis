import { generateDebateOgImageResponse } from '~/core/debates/debate-og-image';
import { GeoChatRequestError, loadDebateOgPreview } from '~/core/debates/server/debate-source';
import { getImagePath } from '~/core/utils/utils';

import { checkRankingOgIpRateLimit, getClientIp } from '../../ranking-og/rate-limit';
import { jsonResponse } from '../../ranking-og/route-utils';

export const runtime = 'nodejs';

/**
 * Renders the debate share card from query parameters, without a debate (GEO-2755).
 *
 * The published card is generated once at publish time from a real debate's stills and speakers,
 * which means it cannot be exercised at all until a debate has finished processing. This route
 * exists so the design can be reviewed and the claim-size ladder checked against real strings
 * before any of that is wired up.
 *
 * Shares the ranking card's IP limiter: this is public, unauthenticated image generation, and the
 * cost per request is the same shape.
 *
 * `?debate=<uuid>` renders one real processed debate — its claim, both speakers, their avatars and
 * their stills — and is the form worth sharing. The stills are presigned and expire in about
 * fifteen minutes, so they are resolved per request here rather than baked into a URL that would
 * quietly fall back to the placeholder field once they lapsed.
 *
 * Without it, every piece is a query parameter, which is what allows the design to be checked
 * against claim strings no debate has produced yet.
 *
 * `avatar1`/`avatar2` and `still1`/`still2` accept either an `ipfs://` URI or an `https://` URL.
 * The stills are the one part of the card that cannot be previewed from real data yet: they are
 * meant to come from each speaker's own recording, seeked into their first speaking turn, and that
 * needs a processed debate. Passing them here is what lets the divider and scrim be judged over
 * real imagery instead of the placeholder field. Satori can only fetch
 * `https:` and `data:`, so an IPFS URI is resolved to a gateway URL here rather than handed
 * through — passing one straight to the card renders the initials fallback and looks like the
 * avatar simply failed.
 */
export async function GET(req: Request): Promise<Response> {
  const rateLimit = await checkRankingOgIpRateLimit(getClientIp(req));
  if (!rateLimit.ok) {
    return jsonResponse(429, { ok: false, error: 'rate_limited', retryAfter: rateLimit.retryAfter });
  }

  const url = new URL(req.url);

  const debateId = url.searchParams.get('debate')?.trim();
  if (debateId) {
    try {
      const card = await loadDebateOgPreview(debateId);
      if (!card) {
        return jsonResponse(404, {
          ok: false,
          error: 'no_stills',
          hint: 'that debate has no speaker stills; it was rendered before geo-chat produced them',
        });
      }
      return generateDebateOgImageResponse(card);
    } catch (error) {
      const status = error instanceof GeoChatRequestError ? error.status : 502;
      return jsonResponse(status >= 400 && status < 500 ? 404 : 502, {
        ok: false,
        error: 'debate_unavailable',
        hint: `could not load debate ${debateId}`,
      });
    }
  }

  const claim = url.searchParams.get('claim')?.trim();
  if (!claim) {
    return jsonResponse(400, { ok: false, error: 'missing_claim', hint: 'pass ?debate=<uuid>, or ?claim=…' });
  }

  return generateDebateOgImageResponse({
    claim,
    speakers: [
      {
        name: url.searchParams.get('name1') ?? 'Alex Rivera',
        stance: url.searchParams.get('stance1') ?? 'Agrees',
        avatarSrc: resolveImage(url.searchParams.get('avatar1')),
        stillSrc: resolveImage(url.searchParams.get('still1')),
      },
      {
        name: url.searchParams.get('name2') ?? 'Sam Okafor',
        stance: url.searchParams.get('stance2') ?? 'Disagrees',
        avatarSrc: resolveImage(url.searchParams.get('avatar2')),
        stillSrc: resolveImage(url.searchParams.get('still2')),
      },
    ],
  });
}

/** Absent stays absent, so the card falls back rather than rendering a broken image. */
function resolveImage(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? getImagePath(trimmed) : null;
}
