/** For a person geo-chat has no name for yet (profile not indexed). Never an id: ids can get published. */
export const UNNAMED_DEBATER = 'Debater';

export function debaterName(displayName: string | null | undefined) {
  return displayName?.trim() || UNNAMED_DEBATER;
}

export function speakerLabel(participant: { display_name?: string | null }) {
  return debaterName(participant.display_name);
}

/**
 * A handle in brackets at the end of a name, "Alexa Dominique (alexadominique.8)": lowercase, no
 * spaces. Some profiles carry one in their name. A name's own brackets ("Sam (Samantha) Lee") stay.
 */
const TRAILING_HANDLE = /\s*\([a-z0-9][a-z0-9._-]*\)\s*$/;

/**
 * A debater's name as a label over their video and transcript lines (GEO-3728), where a handle in
 * the name is noise. Search, pickers and profiles keep `speakerLabel`'s full name, which tells two
 * people with the same name apart.
 */
export function speakerShortLabel(participant: { display_name?: string | null }) {
  const name = speakerLabel(participant);
  return name.replace(TRAILING_HANDLE, '').trim() || name;
}
