/**
 * Image values are free-text entity properties, so an author can type anything into one.
 *
 * Kept in a leaf module of its own rather than in `utils.ts` because `utils.ts` imports `Entities`,
 * and the share-image chain in `entity/entities.ts` needs this check — importing it from there would
 * close a cycle. `utils.ts` re-exports it, so existing callers are unaffected.
 */

/**
 * Whether a value can be handed to an `<img>` as a src at all.
 *
 * `next/image` throws on a src that is neither root-relative nor an absolute URL, which kills the
 * whole page that rendered it. An `ipfs://` URI parses as absolute and passes here; it is resolved
 * to a gateway URL later by `getImagePath`.
 */
export const isRenderableImageSrc = (src: string) => {
  if (src.startsWith('/')) return true;
  try {
    new URL(src);
    return true;
  } catch {
    return false;
  }
};
