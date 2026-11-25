import type { DebateParticipant } from './api';

/**
 * Which recording slot the debates app draws on top of a debate's two stacked speakers (GEO-3833).
 *
 * The app puts the Agree speaker on top: the slot whose `position_label` reads "agree", ignoring
 * case and spacing, and slot 1 otherwise. A debate with no "agree" label yet — Open rounds before a
 * side is accepted, or a claim whose sides geo-chat labels differently — keeps slot 1 on top, which
 * is the order this app drew before. Ported from debates-react-native `StackedVideoFrame.tsx`
 * without its native branch, since this is the web rendition.
 *
 * Every rendition of the card and the full screen reads the same answer, so opening a debate full
 * screen never flips its speakers.
 */
export function compositeTopSlot(
  participants: ReadonlyArray<Pick<DebateParticipant, 'participant_slot' | 'position_label'>> | null | undefined
): 1 | 2 {
  const agree = participants?.find(person => person.position_label?.trim().toLowerCase() === 'agree');
  return agree?.participant_slot === 2 ? 2 : 1;
}
