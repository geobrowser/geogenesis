/**
 * Resolve a call participant's avatar into a value the image components understand.
 *
 * curator-backend names the field a CID, but what it carries is whatever the profile held — a bare
 * CID for some participants, an already-qualified `ipfs://` or https URL for others. Prefixing
 * blindly is what breaks the qualified ones: `ipfs://ipfs://Qm…` parses to an *empty* hash (the
 * split takes the segment between the two prefixes), which resolves to the bare gateway root. That
 * is a perfectly valid URL, so it passes the renderable check, reaches the browser, and 404s —
 * leaving a broken-image glyph rather than degrading to the generated avatar.
 *
 * Returns `undefined` for an absent value so callers land on the generated avatar instead.
 */
export function participantAvatarUrl(avatarCid?: string | null): string | undefined {
  const value = avatarCid?.trim();
  if (!value) return undefined;

  // Already addressable — either an IPFS URI or something the browser can fetch directly.
  if (/^(ipfs:\/\/|https?:\/\/|data:|\/)/.test(value)) return value;

  return `ipfs://${value}`;
}
