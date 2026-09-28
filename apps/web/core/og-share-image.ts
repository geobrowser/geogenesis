import { Relation } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { getImagePath } from '~/core/utils/utils';

/**
 * What `next/og` can actually fetch, and the entity chain that has to satisfy it.
 *
 * Satori runs on the server with no page to inherit an origin from, so "a browser would render
 * this" is the wrong test here: a root-relative `/static/a.png` or a protocol-relative
 * `//host/a.png` is perfectly valid in an `<img>` and unfetchable in a card. `isRenderableImageSrc`
 * is the browser-side question and stays where the browser-side callers are; this is the
 * server-side one.
 *
 * It matters because of the chain rather than in spite of it. Accepting a value the card cannot
 * fetch does not merely fail — it shadows the cover underneath, which would have worked, and turns
 * a wrong OG Image into a worse card than no OG Image at all (GEO-2782).
 */

/**
 * Resolve a stored image value to something Satori can fetch, or null.
 *
 * Resolution comes first: `ipfs://` becomes a gateway URL, and everything else passes through. That
 * ordering is the point of the check rather than a detail — `getImagePath` only rewrites the exact
 * lowercase `ipfs://` prefix, so near-misses like `ipfs:QmAbc` or `IPFS://QmAbc` survive it
 * unchanged and are then correctly rejected here as the unfetchable strings they are.
 *
 * `allowedHosts` narrows http(s) to a known set. The ranking card passes its gateways, because it
 * composes many third-party images and would rather fetch none than an arbitrary host. Entity cards
 * render one image the author chose and pass nothing, so an external `https://` cover keeps working.
 */
export function toSatoriImageSrc(value: string | null | undefined, allowedHosts?: ReadonlySet<string>): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const resolved = getImagePath(trimmed);

  // Only an image data URL is a picture; `data:text/html,...` parses just as happily.
  if (resolved.startsWith('data:')) return resolved.startsWith('data:image/') ? resolved : null;

  try {
    const url = new URL(resolved);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (allowedHosts && !allowedHosts.has(url.host)) return null;
    return resolved;
  } catch {
    // Not absolute — a relative path has no origin for a server-side fetch to resolve against.
    return null;
  }
}

/**
 * The image an entity wants on its share card: OG Image, then cover, then avatar.
 *
 * Each candidate is validated before the next is considered, so a candidate the card cannot fetch
 * falls through instead of winning. Returns undefined when none of them can be rendered, which is
 * `generateOgImage`'s signal to draw the default card.
 */
export function ogShareImageSrc(relations?: Relation[]): string | undefined {
  const candidates = [Entities.ogImage(relations), Entities.cover(relations), Entities.avatar(relations)];

  for (const candidate of candidates) {
    const src = toSatoriImageSrc(candidate);
    if (src) return src;
  }

  return undefined;
}
