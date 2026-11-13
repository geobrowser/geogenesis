/** For a person geo-chat has no name for yet (profile not indexed). Never an id: ids can get published. */
export const UNNAMED_DEBATER = 'Debater';

export function debaterName(displayName: string | null | undefined) {
  return displayName?.trim() || UNNAMED_DEBATER;
}

/**
 * A handle geo-chat appends to some display names, "Alexa Dominique (alexadominique.8)": lowercase,
 * no spaces, in brackets at the very end. A name's own brackets ("Sam (Samantha) Lee") stay.
 */
const TRAILING_HANDLE = /\s*\([a-z0-9][a-z0-9._-]*\)\s*$/;

export function speakerLabel(participant: { display_name?: string | null }) {
  const name = debaterName(participant.display_name);
  return name.replace(TRAILING_HANDLE, '').trim() || name;
}
