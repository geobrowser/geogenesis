import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';

import { FallbackImage } from '~/design-system/fallback-image';

/**
 * A company or school's logo, at a fixed size.
 *
 * Two things this exists to stop repeating. **The box is the size**, because
 * `Avatar` and `FallbackImage` both render `h-full w-full` — an unwrapped one
 * fills whatever column it lands in, which is how a logo once pushed the
 * Experience dates out over the rail.
 *
 * And **Geo's placeholder, not a generated one**. `Avatar` falls back to a
 * gradient beam, which is a different picture for every organisation and reads
 * as a logo somebody chose rather than as the absence of one.
 */
export function OrganizationImage({ url, size }: { url: string | null | undefined; size: 16 | 20 | 36 }) {
  const box = size === 36 ? 'h-9 w-9 rounded' : size === 20 ? 'h-5 w-5 rounded-sm' : 'h-4 w-4 rounded-sm';

  return (
    <span className={`relative shrink-0 overflow-hidden bg-grey-01 ${box}`}>
      <FallbackImage value={url ?? PLACEHOLDER_SPACE_IMAGE} sizes={`${size}px`} className="object-cover" />
    </span>
  );
}
