/**
 * Image values are free-text entity properties, so an author can type anything into one.
 *
 * Kept in a leaf module of its own rather than in `utils.ts` because `utils.ts` imports `Entities`,
 * and the share-image chain in `entity/entities.ts` needs this check — importing it from there would
 * close a cycle. `utils.ts` re-exports it, so existing callers are unaffected.
 */

/**
 * Schemes a value can carry and still end up as a picture.
 *
 * An allowlist rather than "whatever `new URL` parses", because `new URL` is a syntax check and
 * says nothing about whether the thing can render: `mailto:`, `javascript:`, `file:` and `blob:`
 * all parse. That matters most in the share-image chain, where the first accepted candidate wins —
 * a `mailto:` typed into OG Image would shadow a cover that works, which is the failure this guard
 * exists to prevent rather than one it should wave through. `file:` is also the one form we would
 * rather never hand to a server-side fetch at all.
 *
 * `ipfs:` is here because the chain checks the raw value before `getImagePath` resolves it to a
 * gateway; by the time `FallbackImage` runs the same check, it has already become `https:`.
 */
const RENDERABLE_IMAGE_PROTOCOLS = new Set(['http:', 'https:', 'ipfs:']);

/**
 * Whether a value can be handed to an `<img>` as a src at all.
 *
 * `next/image` throws on a src that is neither root-relative nor an absolute URL, which kills the
 * whole page that rendered it — and a src that parses but cannot render is no better for a share
 * card, so the scheme is checked too.
 */
export const isRenderableImageSrc = (src: string) => {
  if (src.startsWith('/')) return true;

  let parsed: URL;
  try {
    parsed = new URL(src);
  } catch {
    return false;
  }

  // Only an image data URL is a picture; `data:text/html,...` parses just as happily.
  if (parsed.protocol === 'data:') return src.startsWith('data:image/');

  return RENDERABLE_IMAGE_PROTOCOLS.has(parsed.protocol);
};
