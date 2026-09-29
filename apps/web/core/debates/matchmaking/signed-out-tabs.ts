import type { DebatesHubTab } from '~/atoms';

/**
 * GEO-2725. Lobby, Positions and Requests are a particular person's, so signed out they have no
 * possible contents — not an empty list but a meaningless one. Both of Lobby's lists are viewer-relative:
 * geo-chat scores `debate_now` on who is available to debate *you*, and a match is a claim you hold
 * a side on. Explore and People describe the world rather than the viewer, so both read fine
 * anonymously and are what the hub offers before sign-in (GEO-2861). Positions is the third of the
 * viewer's own: it was a source inside Explore's picker and left that menu signed out for exactly
 * this reason, so promoting it to a tab (GEO-2863) promotes the rule with it.
 *
 * In the order the anonymous row draws them, and it is read that way below rather than used to
 * filter the signed-in order. Filtered, this list said what the row contained and `TABS` quietly
 * decided how it was arranged: the row led with People while the panel opened on Explore, which is
 * the one an anonymous visitor is actually here for and the one `visibleTab` falls back to.
 */
export const SIGNED_OUT_TABS: DebatesHubTab[] = ['explore', 'people'];

/**
 * A tab with nothing to show until the viewer signs in. A link naming one (a scheduling email's
 * Requests link, say) has to sign them in first, or the hub opens on Explore instead.
 */
export function tabNeedsSignIn(tab: DebatesHubTab): boolean {
  return !SIGNED_OUT_TABS.includes(tab);
}
