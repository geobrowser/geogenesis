/**
 * The white circle every control over the video wears: play/pause, mute, and the end card's replay.
 *
 * Shared so the replay that takes pause's place at the end cannot drift from the pause control it
 * replaces.
 */
export const CONTROL_CIRCLE_CLASS =
  'grid size-10.5 place-items-center rounded-full bg-white text-text shadow-light [&>svg]:scale-[1.3]';
