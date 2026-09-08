/**
 * Constraints for the Edit profile modal (GEO-2839).
 *
 * The graph imposes none of these — a 40 MB phone photo is a valid banner today.
 * They are product limits, so they live in one pure module the modal and its
 * tests can both read.
 *
 * Description length is deliberately absent: it is free text and the graph does
 * not cap it, so neither does the modal.
 */

export const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Mirrors the `accept` attribute the design system's image fields already use.
 * The file picker enforces it for us; a drag-and-drop does not, which is the
 * reason this list is exported rather than left inline on the input.
 */
export const ACCEPTED_PROFILE_IMAGE_TYPES = ['image/png', 'image/jpeg'] as const;

export const ACCEPTED_PROFILE_IMAGE_ATTR = ACCEPTED_PROFILE_IMAGE_TYPES.join(', ');

export type ProfileImageKind = 'banner' | 'avatar';

const IMAGE_NOUN: Record<ProfileImageKind, { singular: string; plural: string }> = {
  banner: { singular: 'banner', plural: 'Banners' },
  avatar: { singular: 'photo', plural: 'Photos' },
};

function formatMegabytes(bytes: number) {
  const mb = bytes / (1024 * 1024);
  // Round up, not to nearest: this number only ever appears in a rejection, and
  // rounding 5.04 down to "5.0 MB" would read as within the 5 MB ceiling it just
  // failed.
  return `${(Math.ceil(mb * 10) / 10).toFixed(1)} MB`;
}

/**
 * Returns a user-facing rejection message, or null when the file is acceptable.
 * Checked before the upload starts — a rejection after a 40 MB round trip is
 * the failure mode this exists to prevent.
 */
export function validateProfileImage(file: File, kind: ProfileImageKind): string | null {
  const noun = IMAGE_NOUN[kind];

  if (!(ACCEPTED_PROFILE_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return `${noun.plural} have to be a PNG or JPEG.`;
  }

  if (file.size > MAX_PROFILE_IMAGE_BYTES) {
    return `That file is ${formatMegabytes(file.size)}. ${noun.plural} have to be under 5 MB.`;
  }

  return null;
}
