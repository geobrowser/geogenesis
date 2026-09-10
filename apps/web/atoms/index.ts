import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

import type { MatchmakingClaimsFilter } from '~/core/debates/api';

export const showingIdsAtom = atomWithStorage<boolean>('showingIds', false);

export const editingPropertiesAtom = atom<boolean>(false);

export type EntitySidePanelTarget = {
  entityId: string;
  spaceId: string;
  openedWithMainViewEditing: boolean;
  openedFromReviewEdits?: boolean;
};

export const entitySidePanelAtom = atom<EntitySidePanelTarget | null>(null);

export const entitySidePanelHostElementAtom = atom<HTMLElement | null>(null);

/**
 * Whether a space rail is currently rendering content. The header lives in the
 * layout (separate DOM from the page body), so it can't use `has-[aside]`.
 */
export const spaceSidebarHasContentAtom = atom<boolean | null>(null);

/**
 * Entity whose comments are open in the global comments panel, or `null` when
 * it's closed. Comment buttons appear on entities all over the app — explore
 * cards, feed rows, data blocks — and everywhere except an entity's own full
 * page they should open the comments beside what you're reading rather than
 * navigate away from it.
 */
export const entityCommentsPanelAtom = atom<{ entityId: string; spaceId: string } | null>(null);

export type DebatesHubTab = 'requests' | 'lobby' | 'explore' | 'people';

/** `null` while the debates matchmaking hub is closed. */
export const debatesHubAtom = atom<{ tab: DebatesHubTab } | null>(null);

/**
 * The hub's filter selections, held outside the tabs that draw them (GEO-2850).
 *
 * They used to be `useState` inside each tab, which made them as short-lived as the panel. The hub
 * closes on any outside pointer-down, and dismissing a dropdown by clicking away — rather than by
 * clicking back into the trigger — lands outside the panel and does exactly that. So the two ways
 * of closing the same dropdown had two different outcomes, and only one of them kept the viewer's
 * work. Reported as "the filters disappear", and the same root cause as selections not surviving a
 * trip away from the panel.
 *
 * Scoped to the page session on purpose: they outlive the panel and navigation between pages, and
 * reset on a reload or in a new tab. Not persisted to storage, which keeps GEO-2789's
 * membership-based default meaningful — it seeds once per session rather than once per device,
 * ever — and spares a viewer a filter they set days ago and have forgotten.
 *
 * Split per surface because the two menus describe different lists: the Claims facets are the
 * whole tagged corpus, the Matches ones are only what the viewer has a match on.
 */
/**
 * Which list the Claims tab is showing. `featured` is the tab's own rather than geo-chat's, which
 * is why this is not just {@link MatchmakingClaimsFilter} — typed off it so the two cannot drift.
 *
 * Persisted with the rest of the filter bar (GEO-2850): it is the same dropdown, dismissed the same
 * way, and losing it on a click-away was the same surprise.
 *
 * The signed-out coercion stays where it is, in the tab. It is a rule about what may be *shown*,
 * not about what the viewer picked, so it leaves this value alone — which is what lets a viewer who
 * signs in keep the list they had chosen. Changing account is the one thing that clears it; see
 * {@link debatesHubFiltersOwnerAtom}.
 */
/**
 * What Explore's source picker offers. Only `debate_now` left it, for Lobby: that list is scored on
 * who is available to debate *you*, which is a question about arranging a debate rather than about
 * the corpus. `mine` stayed — it is the viewer's own cut of the same catalogue, and reads as one
 * more answer to "which claims?" rather than as a surface of its own.
 */
export type DebatesHubExploreFilter = Exclude<MatchmakingClaimsFilter, 'debate_now'> | 'featured';
export const debatesHubExploreFilterAtom = atom<DebatesHubExploreFilter>('all');

export const debatesHubExploreSpaceIdsAtom = atom<string[]>([]);
export const debatesHubExploreTopicIdsAtom = atom<string[]>([]);

/**
 * Lobby's own space selection (GEO-2861).
 *
 * One selection, not two. Claims and Matches each kept their own while they were separate tabs;
 * Lobby is a single tab whose two states answer the same question, so carrying two selections
 * across the "Matches only" toggle would silently re-filter the list on a switch the viewer reads
 * as narrowing, not as changing what they had picked.
 *
 * The menu behind it is still derived twice — Explore's comes from a server facet, the matches list
 * counts from its own rows — so a space can be selected and then absent from the options after a
 * toggle. `keepSelectedVisible` is what keeps it pickable, and so untickable, either way.
 */
export const debatesHubLobbySpaceIdsAtom = atom<string[]>([]);
export const debatesHubLobbyTopicIdsAtom = atom<string[]>([]);

/**
 * Whether the Claims tab's membership default has been applied or forfeited this session.
 *
 * `useMemberSpaceDefault` spends its seed once per *mount*, which was the right lifetime while the
 * selection died with the mount too. Now that the selection outlives the panel, the seed has to as
 * well — otherwise reopening the hub would re-seed a viewer's deliberately cleared filter and
 * decide they meant something other than what they asked for.
 */
export const debatesHubExploreSpaceSeedSpentAtom = atom(false);
export const debatesHubLobbySpaceSeedSpentAtom = atom(false);

/**
 * Which account the filter state above belongs to, so it is never handed to a different viewer.
 *
 * Session-scoped state outlives the sign-in that changes who is looking, so "whose are these" has
 * to be recorded rather than assumed. Two transitions, and they want opposite answers:
 *
 * A viewer signing in is the same person authenticating, and keeps the bar they were just using —
 * the Claims tab prompts for sign-in from inside its own empty state, so clearing it there would
 * lose picks made seconds earlier. `owner` being null marks that case, and nothing is reset.
 *
 * A different established account is a different viewer, and inherits nothing: without this,
 * switching accounts without a reload would show B the spaces A had picked. `owner` keeps naming
 * the last account seen across a sign-out, so B signing in after A signs out is still read as a
 * handover rather than a first sign-in.
 *
 * Neither was reachable while the selection reset on every mount.
 */
export const debatesHubFiltersOwnerAtom = atom<string | null>(null);

/**
 * Puts the whole filter bar back to its defaults. Write-only, and in one place, so a new filter
 * atom is added to the reset by adding it here rather than by remembering every call site.
 */
export const resetDebatesHubFiltersAtom = atom(null, (_get, set) => {
  set(debatesHubExploreFilterAtom, 'all');
  set(debatesHubExploreSpaceIdsAtom, []);
  set(debatesHubExploreTopicIdsAtom, []);
  set(debatesHubExploreSpaceSeedSpentAtom, false);
  set(debatesHubLobbySpaceIdsAtom, []);
  set(debatesHubLobbyTopicIdsAtom, []);
  set(debatesHubLobbySpaceSeedSpentAtom, false);
  // `debatesHubMatchesOnlyAtom` is deliberately absent: it is a standing preference rather than
  // working state, which is the whole reason it is stored rather than session-scoped. Handing a new
  // account the previous one's *filters* is a leak; handing them a browsing preference held on this
  // device is the same thing every other stored preference here does.
});

/**
 * Whether Lobby is showing matches only (GEO-2861).
 *
 * Stored, unlike the rest of the filter bar. The bar is session-scoped on purpose (GEO-2850)
 * because it is working state — what you are looking through right now. This is not that: it is a
 * standing answer to how you like to arrive at a debate, and a viewer who only ever wants a
 * confirmed match should not have to say so again every session.
 *
 * Off by default. The wider list is the one that can always answer; opening onto a stricter list
 * that is usually empty would read as the hub being broken rather than as a filter being on.
 */
export const debatesHubMatchesOnlyAtom = atomWithStorage('debatesHubMatchesOnly', false);

/**
 * The same standing preference for the debate-again flow (GEO-2861), under its own key.
 *
 * Two keys rather than one: the hub asks "who can I debate right now, out of everyone", the rematch
 * picker asks "which of this opponent's claims can we go again on". Wanting the strict answer to one
 * is not a statement about the other, and sharing a key would make it one.
 */
export const rematchMatchesOnlyAtom = atomWithStorage('rematchMatchesOnly', false);

export const rankingComposeRemoveScrollShardAtom = atom<HTMLElement | null>(null);

// Set to `Date.now()` whenever a ranking "Create new" entity is published. The
// proposal isn't indexed the instant publish resolves, so a single refetch on
// success misses it; the pending-proposal query reads this signal and polls for
// a short window until the new PROPOSED proposal surfaces.
export const rankingPendingPublishedAtAtom = atom<number | null>(null);

// Short links (e.g. /r/g/[blockEntityId]) don't carry the space in the URL, so
// pages that resolve their space publish it here for the navbar breadcrumb.
export const navbarSpaceOverrideAtom = atom<{ spaceId: string } | null>(null);

export const rankingFullscreenActiveAtom = atom<boolean>(false);

// Set while the full-screen debates feed is on screen. A Debate entity page renders the feed
// from a route `Main` otherwise treats as an ordinary entity page, so without this it wraps a
// viewport-filling takeover in `max-w-[1200px] pt-8 pb-16` — which makes the document taller
// than the viewport and lets the feed scroll up under the sticky navbar.
export const debateFullscreenActiveAtom = atom<boolean>(false);

export const entitySidePanelWantsEditAtom = atom(false);

export const entitySidePanelPersistEditorAtom = atom<(() => void) | null>(null);

export const editorHasContentAtom = atom<boolean>(false);

// Bumped to force the TipTap editor to recreate with fresh content.
export const editorContentVersionAtom = atom<number>(0);

export const dismissedNoticesAtom = atomWithStorage<Array<string>>('dismissedNotices', []);

export type RepeatingNotice = { dismissedCount: number; lastDismissed: string };

export const teamNoticeDismissedAtom = atomWithStorage<RepeatingNotice>('dismissedTeamNotice', {
  dismissedCount: 0,
  lastDismissed: '',
});

export * from './personal-profile-suggested';
export * from './dismissed-hints';
