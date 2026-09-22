import { ID } from '~/core/id';
import { NavUtils } from '~/core/utils/utils';

/**
 * The link and the wording a shared debate carries, wherever it is shared from — the in-app share
 * sheet's composer hand-offs and the OS share sheet the mobile Share button opens. Kept in one
 * place so the two surfaces cannot drift into two spellings of the same share.
 */
export const SHARE_TAGLINE = 'Watch the debate on Geo!';

/** The canonical hex entity URL for a debate, which is what every share should point at. */
export function debateShareUrl(spaceId: string, debateId: string) {
  return `${window.location.origin}${NavUtils.toEntity(spaceId, ID.uuidToHex(debateId))}`;
}

/**
 * The claim, then the tagline. `maxLength` trims the claim to fit a platform's cap (Reddit titles,
 * tweet length, LinkedIn posts); omit it where there is no cap, as in the OS share sheet.
 */
export function debateShareMessage(claim: string, maxLength?: number) {
  const suffix = `. ${SHARE_TAGLINE}`;
  const trimmedClaim = claim.trim();
  if (maxLength === undefined) return `${trimmedClaim}${suffix}`;

  const claimRoom = maxLength - suffix.length;
  const fittedClaim =
    trimmedClaim.length > claimRoom ? `${trimmedClaim.slice(0, Math.max(0, claimRoom - 1)).trimEnd()}…` : trimmedClaim;
  return `${fittedClaim}${suffix}`;
}
