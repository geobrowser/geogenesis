/** For a person geo-chat has no name for yet (profile not indexed). Never an id: ids can get published. */
export const UNNAMED_DEBATER = 'Debater';

export function debaterName(displayName: string | null | undefined) {
  return displayName?.trim() || UNNAMED_DEBATER;
}

export function speakerLabel(participant: { display_name?: string | null }) {
  return debaterName(participant.display_name);
}
