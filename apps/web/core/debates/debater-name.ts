/**
 * The label for a person geo-chat has no name for yet. geo-chat accepts an account before its
 * profile is indexed, so `display_name` can be null anywhere it returns people. Never fall back
 * to an id: it reads as a broken page and can end up published.
 */
export const UNNAMED_DEBATER = 'Debater';

export function debaterName(displayName: string | null | undefined) {
  return displayName?.trim() || UNNAMED_DEBATER;
}

export function speakerLabel(participant: { display_name?: string | null }) {
  return debaterName(participant.display_name);
}
