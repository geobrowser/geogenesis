import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

import type { ActionContext, ActionScope } from '~/core/action-context';
import type { Debate } from '~/core/debates/api';
import type { CalloutDay } from '~/core/debates/todays-claims/todays-callout';
import type { EntitySidePanelTabSelection } from '~/core/utils/entity-tab-navigation';

export const showingIdsAtom = atomWithStorage<boolean>('showingIds', false);

export const editingPropertiesAtom = atom<boolean>(false);

export type EntitySidePanelTarget = {
  analyticsContext?: ActionContext;
  /** A linked entity tab to select when the panel opens. */
  initialTab?: EntitySidePanelTabSelection;
  entityId: string;
  spaceId: string;
  openedWithMainViewEditing: boolean;
  openedFromReviewEdits?: boolean;
  /** Keep this exact space scope instead of choosing the entity's usual top-ranked home space. */
  forceRequestedSpace?: boolean;
  /**
   * Open scrolled to the entity's comments — a claim's Activity — rather than at the top. The panel's
   * stand-in for the full page's `#entity-comments`; see `useScrollToCommentsOnOpen`.
   */
  scrollToComments?: boolean;
};

export const entitySidePanelAtom = atom<EntitySidePanelTarget | null>(null);

export const entitySidePanelHostElementAtom = atom<HTMLElement | null>(null);

/**
 * Where the sticky entity header draws itself: a zero-height element docked under the navbar by the
 * app shell.
 *
 * The bar has to span the content column and sit under the navbar, and the entity route that knows
 * *which* entity is on screen renders deep inside a width-capped, transform-animated `<main>` —
 * neither a full-bleed `sticky` nor a `fixed` element behaves there. Registering a host once in the
 * shell and portalling into it keeps the positioning in the one place that can express it.
 */
export const entityStickyHeaderHostElementAtom = atom<HTMLElement | null>(null);

/**
 * The comments panel's own element, for the same reason the side panel registers one: a slide-up
 * locks scrolling everywhere but its own subtree, and a panel portalled to the body is outside it.
 */
export const commentsPanelHostElementAtom = atom<HTMLElement | null>(null);

/**
 * A body-level container an open slide-up offers to popovers that portal out of it.
 *
 * Raising such a popover above the sheet is only half of what it needs: the sheet locks scrolling
 * everywhere outside its own subtree, and a popover on the body is outside it — so a list taller than
 * its own max-height could be seen and not scrolled. Living in a container the sheet registers as a
 * scroll shard fixes that without moving the popover out of the body, which is where its positioning
 * already works.
 *
 * Reads the topmost sheet's container, since that is the sheet a popover is being opened over.
 */
export const slideUpPopoverContainerAtom = atom(get => get(slideUpPopoverContainersAtom).at(-1)?.container ?? null);

/**
 * The slide-ups that are open, in the order they opened — so the last is the one on top.
 *
 * A list rather than a count, for the reason the count replaced a flag and then did not go far enough:
 * several sheets can be open, and the things that ask about them need to know *which* is on top, not
 * only that one is. Escape belongs to the topmost sheet alone, and a popover opened over the sheet
 * underneath still needs that sheet's own container. Each entry is an opaque token owned by one sheet.
 */
export const openSlideUpsAtom = atom<symbol[]>([]);

/**
 * How many slide-ups are open. Derived, so there is one account of it — read by overlays deciding
 * whether they have to clear a sheet. Writable by a count for tests and stories, which mint that many
 * stand-in tokens.
 */
export const slideUpOpenCountAtom = atom(
  get => get(openSlideUpsAtom).length,
  (_get, set, count: number) => {
    set(
      openSlideUpsAtom,
      Array.from({ length: Math.max(0, count) }, () => Symbol('slide-up'))
    );
  }
);

/**
 * The body-level popover container belonging to the sheet on top, or `null` when none is open.
 *
 * Keyed by sheet so that a sheet closing gives back its own and uncovers whatever was underneath —
 * storing a single container meant two overlapping sheets left *no* container once the upper one
 * closed, and popovers over the lower one went back to being unscrollable.
 */
export const slideUpPopoverContainersAtom = atom<{ token: symbol; container: HTMLElement }[]>([]);

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
export type EntityCommentsPanelTarget = {
  entityId: string;
  spaceId: string;
  /** Logical graph type retained so comments created from the global panel are attributed correctly. */
  targetEntityType?: string;
};

export const entityCommentsPanelAtom = atom<EntityCommentsPanelTarget | null>(null);

/**
 * The debate whose claims panel an explore card has open, or `null`. Drawn by an app-level host, not
 * the card: a card inside the entity side panel unmounts when opening this closes that panel.
 */
export type ExploreDebateClaimsPanelTarget = {
  debateId: string;
  debate: Debate;
  /** The opening card's analytics scope, so the panel keeps attributing to it. */
  scope: ActionScope;
};

export const exploreDebateClaimsPanelAtom = atom<ExploreDebateClaimsPanelTarget | null>(null);

/** Which panel the full-screen debate feed has open, or `null`. */
export const debateFeedPanelAtom = atom<'claims' | 'comments' | null>(null);

/**
 * Every panel sharing the one right-hand slot. Opening any of these clears the others.
 *
 * A slot panel whose opener can sit inside another slot panel must render from an app-level host,
 * or clearing that panel unmounts the new one. Hosts close their own panel on route change.
 *
 * Not in this slot (left alone on purpose): ranking-compose entity sheets, proposal review
 * panels (exclusive among themselves), the debates hub, and slide-ups (those stack).
 */
type EntityPanelKind = 'entity' | 'comments' | 'exploreDebateClaims' | 'debateFeed';

const clearEntityPanelsExceptAtom = atom(null, (_get, set, keep: EntityPanelKind) => {
  if (keep !== 'entity') set(entitySidePanelAtom, null);
  if (keep !== 'comments') set(entityCommentsPanelAtom, null);
  if (keep !== 'exploreDebateClaims') set(exploreDebateClaimsPanelAtom, null);
  if (keep !== 'debateFeed') set(debateFeedPanelAtom, null);
});

export const openEntitySidePanelAtom = atom(null, (_get, set, target: EntitySidePanelTarget | null) => {
  set(entitySidePanelAtom, target);
  if (target) set(clearEntityPanelsExceptAtom, 'entity');
});

export const openEntityCommentsPanelAtom = atom(null, (_get, set, target: EntityCommentsPanelTarget | null) => {
  set(entityCommentsPanelAtom, target);
  if (target) set(clearEntityPanelsExceptAtom, 'comments');
});

export const openExploreDebateClaimsPanelAtom = atom(
  null,
  (_get, set, target: ExploreDebateClaimsPanelTarget | null) => {
    set(exploreDebateClaimsPanelAtom, target);
    if (target) set(clearEntityPanelsExceptAtom, 'exploreDebateClaims');
  }
);

export const openDebateFeedPanelAtom = atom(null, (_get, set, panel: 'claims' | 'comments' | null) => {
  set(debateFeedPanelAtom, panel);
  if (panel) set(clearEntityPanelsExceptAtom, 'debateFeed');
});

export type DebatesHubTab = 'requests' | 'lobby' | 'explore' | 'positions' | 'people';

/**
 * `null` while the debates matchmaking hub is closed. `requestId` is a scheduled request a link
 * asked to see (GEO-3431): the Requests tab brings it into view and outlines it until the hub is
 * opened on something else.
 */
export const debatesHubAtom = atom<{ tab: DebatesHubTab; requestId?: string } | null>(null);

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
 * Split per surface because the two menus describe different lists: Explore's facets are the whole
 * tagged corpus, Lobby's are only what the viewer can debate right now.
 */

export const debatesHubExploreSpaceIdsAtom = atom<string[]>([]);
export const debatesHubExploreTopicIdsAtom = atom<string[]>([]);

/**
 * The search box, which is part of the same filter bar as the menus above it.
 *
 * Held out here for Lobby's sake first: its two lists are separate components, so flipping "Matches
 * only" unmounts one and mounts the other, and a search living in either one's `useState` was
 * cleared by a toggle that presents itself as narrowing the list. The space and topic selections
 * were already shared across that switch for exactly this reason; the search is the third thing in
 * the bar and belongs with them.
 *
 * Explore's is here too rather than left as local state, so one surface's bar is not held in two
 * different places — and so it survives a click-away that closes the panel, which is the whole of
 * GEO-2850.
 */
export const debatesHubExploreSearchAtom = atom('');

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
export const debatesHubLobbySearchAtom = atom('');

/**
 * Positions' own filter bar (GEO-2863).
 *
 * "My positions" used to be one of three sources behind a dropdown on Explore. It is a tab of its
 * own now: the dropdown was where a viewer had to go to find the claims they had answered, which
 * is the wrong shape for a list people want to reach directly — and with it gone, Explore's row has
 * space for the switch that hides those same claims from it.
 *
 * Its own selection rather than Explore's, for the reason Lobby has its own: they are two tabs
 * asking different questions, and carrying one's spaces and topics into the other re-filters a list
 * the viewer never narrowed.
 */
export const debatesHubPositionsSpaceIdsAtom = atom<string[]>([]);
export const debatesHubPositionsTopicIdsAtom = atom<string[]>([]);
export const debatesHubPositionsSearchAtom = atom('');

/**
 * The side panel's own search and picks for its Matches and Explore tabs (GEO-3463), apart from full
 * screen's lists above.
 *
 * The two surfaces read a selection differently. In the panel every pick narrows (spaces AND, like
 * topics) and nothing is seeded; full screen reads spaces as "any of these" and seeds the viewer's
 * member spaces. Sharing one selection let full screen's seed of three spaces empty the panel's
 * Matches, since no claim sits in three spaces at once. Each panel tab keeps one selection across the
 * lists it swaps between (Matches' offline switch, Explore's Show), so changing those keeps it.
 *
 * The seed markers exist to give the panel's lists the same shape as full screen's; the panel never
 * seeds, so nothing spends them.
 */
export const debatesHubPanelMatchesSpaceIdsAtom = atom<string[]>([]);
export const debatesHubPanelMatchesTopicIdsAtom = atom<string[]>([]);
export const debatesHubPanelMatchesSearchAtom = atom('');
export const debatesHubPanelMatchesSpaceSeedSpentAtom = atom(false);
export const debatesHubPanelExploreSpaceIdsAtom = atom<string[]>([]);
export const debatesHubPanelExploreTopicIdsAtom = atom<string[]>([]);
export const debatesHubPanelExploreSearchAtom = atom('');
export const debatesHubPanelExploreSpaceSeedSpentAtom = atom(false);

/**
 * The People tab's spaces filter (GEO-2944).
 *
 * Its own selection rather than any other tab's, for the reason Lobby and Positions have theirs:
 * this one narrows *people* by spaces where they have debate activity, while the others narrow
 * claims by the space the claim is in. Carrying a selection across would re-filter a list the
 * viewer never narrowed, and the two lists do not even offer the same spaces.
 */
export const debatesHubPeopleSpaceIdsAtom = atom<string[]>([]);

/**
 * The side panel People tab's spaces (GEO-3463), apart from full screen's rail above for the reason
 * the panel's claim tabs have their own: the panel wants someone active in every picked space, the
 * rail in any of them, so the rail's two picks would empty the panel.
 */
export const debatesHubPanelPeopleSpaceIdsAtom = atom<string[]>([]);

/**
 * The People tab's "Online only" switch (GEO-2937). Off, the default, lists offline people with free
 * time this week alongside online ones. Outside the tab for the same reason as the
 * spaces filter above.
 */
export const debatesHubPeopleOnlineOnlyAtom = atom(false);

/**
 * The side panel's Sort, one per tab (GEO-3463). Sort lives in the Filters popover and never counts
 * as a filter, so these sit beside the filters rather than in them — Clear all leaves them alone.
 * Session-scoped like the rest of the bar. People opens Online first (matches order each group);
 * both claim lists open on Explore's ranking.
 */
export type DebatesHubPeopleSort = 'matches' | 'online' | 'az';
export type DebatesHubMatchesSort = 'best' | 'newest' | 'people';
export type DebatesHubExploreSort = 'best' | 'newest';
export const debatesHubPeopleSortAtom = atom<DebatesHubPeopleSort>('online');
export const debatesHubMatchesSortAtom = atom<DebatesHubMatchesSort>('best');
export const debatesHubExploreSortAtom = atom<DebatesHubExploreSort>('best');

/**
 * Matches' "Include people who are offline" (GEO-3463). Off by default: Matches is claims you could
 * debate now. On, it adds claims where only offline people hold the other side, which the card
 * offers as Schedule rather than Debate now.
 */
export const debatesHubMatchesIncludeOfflineAtom = atom(false);

/**
 * Explore's "Someone online to debate" (GEO-3463, decision 39). On, Explore lists only claims where
 * someone online holds a side — the list the old Live tab opened on, moved behind a filter so
 * Matches can mean only matches.
 */
export const debatesHubExploreSomeoneOnlineAtom = atom(false);

/**
 * Whether Explore's Show is on "My positions" (GEO-3463). The positions list used to be a tab of its
 * own; it is now one of Explore's three Shows. Session-scoped: it is a list you look at, not how you
 * like to arrive.
 */
export const debatesHubExploreShowMineAtom = atom(false);

export type DebatesHubExploreShow = 'unanswered' | 'all' | 'mine';

/**
 * Explore's Show control: Not answered (the default), All, or My positions.
 *
 * Not answered and All are the stored "hide my positions" preference the tab already had (GEO-2863),
 * so the panel and full screen keep agreeing about it. My positions swaps the list itself, so it is
 * its own flag and leaves that preference where the viewer put it.
 */
export const debatesHubExploreShowAtom = atom(
  (get): DebatesHubExploreShow =>
    get(debatesHubExploreShowMineAtom) ? 'mine' : get(debatesHubHideMyPositionsAtom) ? 'unanswered' : 'all',
  (_get, set, next: DebatesHubExploreShow) => {
    set(debatesHubExploreShowMineAtom, next === 'mine');
    if (next !== 'mine') set(debatesHubHideMyPositionsAtom, next === 'unanswered');
  }
);

/**
 * Whether each claim-browse surface's membership default has been applied or forfeited this session.
 *
 * `useMemberSpaceDefault` spends its seed once per *mount*, which was the right lifetime while the
 * selection died with the mount too. Now that the selection outlives the panel, the seed has to as
 * well — otherwise reopening the hub would re-seed a viewer's deliberately cleared filter and
 * decide they meant something other than what they asked for.
 */
export const debatesHubExploreSpaceSeedSpentAtom = atom(false);
export const debatesHubLobbySpaceSeedSpentAtom = atom(false);
export const debatesHubPositionsSpaceSeedSpentAtom = atom(false);

/** The debate lobby's Explore tab: its own filters, apart from the hub's Explore. */
export const lobbyExploreSpaceIdsAtom = atom<string[]>([]);
export const lobbyExploreTopicIdsAtom = atom<string[]>([]);
export const lobbyExploreSearchAtom = atom('');
export const lobbyExploreSpaceSeedSpentAtom = atom(false);

/**
 * Whether the hub's move off an empty Lobby is spent for this session (GEO-2863).
 *
 * Spent by the move itself, and by the viewer answering the question it guesses at — pressing
 * "Matches only" either way, or leaving for Explore from the empty state's button. A viewer who has
 * chosen what to look at on Lobby is not moved off it later in the same session.
 *
 * Held out here because `LobbyTab` cannot hold it: `HubSwap` unmounts the tab when the viewer
 * leaves it, so a ref or state inside would be gone by the time they came back. With "Matches only"
 * now defaulting on, a viewer with no matches and an empty `debate_now` list would be moved off
 * Lobby *every time they opened it* — and Lobby is the tab the hub opens on, so there was no way to
 * stay there at all.
 *
 * The move is a courtesy on first arrival, not a policy. Once it has been made, the viewer gets the
 * empty state and can read it.
 */
export const debatesHubLobbyMoveSpentAtom = atom(false);

/**
 * Which account the filter state above belongs to, so it is never handed to a different viewer.
 *
 * Session-scoped state outlives the sign-in that changes who is looking, so "whose are these" has
 * to be recorded rather than assumed. Two transitions, and they want opposite answers:
 *
 * A viewer signing in is the same person authenticating, and keeps the bar they were just using —
 * Explore prompts for sign-in from inside its own empty state, so clearing it there would
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
  set(debatesHubExploreSpaceIdsAtom, []);
  set(debatesHubExploreTopicIdsAtom, []);
  set(debatesHubExploreSearchAtom, '');
  set(debatesHubExploreSpaceSeedSpentAtom, false);
  set(debatesHubLobbySpaceIdsAtom, []);
  set(debatesHubLobbyTopicIdsAtom, []);
  set(debatesHubLobbySearchAtom, '');
  set(debatesHubLobbySpaceSeedSpentAtom, false);
  set(debatesHubPositionsSpaceIdsAtom, []);
  set(debatesHubPositionsTopicIdsAtom, []);
  set(debatesHubPositionsSearchAtom, '');
  set(debatesHubPositionsSpaceSeedSpentAtom, false);
  set(lobbyExploreSpaceIdsAtom, []);
  set(lobbyExploreTopicIdsAtom, []);
  set(lobbyExploreSearchAtom, '');
  set(lobbyExploreSpaceSeedSpentAtom, false);
  set(debatesHubPanelMatchesSpaceIdsAtom, []);
  set(debatesHubPanelMatchesTopicIdsAtom, []);
  set(debatesHubPanelMatchesSearchAtom, '');
  set(debatesHubPanelMatchesSpaceSeedSpentAtom, false);
  set(debatesHubPanelExploreSpaceIdsAtom, []);
  set(debatesHubPanelExploreTopicIdsAtom, []);
  set(debatesHubPanelExploreSearchAtom, '');
  set(debatesHubPanelExploreSpaceSeedSpentAtom, false);
  set(debatesHubPeopleSpaceIdsAtom, []);
  set(debatesHubPanelPeopleSpaceIdsAtom, []);
  set(debatesHubPeopleOnlineOnlyAtom, false);
  set(debatesHubPeopleSortAtom, 'online');
  set(debatesHubMatchesSortAtom, 'best');
  set(debatesHubExploreSortAtom, 'best');
  set(debatesHubMatchesIncludeOfflineAtom, false);
  set(debatesHubExploreSomeoneOnlineAtom, false);
  set(debatesHubExploreShowMineAtom, false);
  // A different viewer has not been shown anything yet, so the courtesy is theirs to receive.
  set(debatesHubLobbyMoveSpentAtom, false);
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
 * On by default. A confirmed match is what the hub is for, so it is what the hub opens on.
 *
 * That was the other way round until now, for a good reason: the wider list is the one that can
 * always answer, and opening onto a stricter list that is usually empty reads as the hub being
 * broken rather than as a filter being on. What changed is that the emptiness is now handled where
 * it arises instead of being avoided by never asking — see `useNarrowedDefault`, which steps back
 * to the wider list on arrival when there is no match to show, and on to Explore when that is empty
 * too. The preference stands; only whether it applies on arrival is decided for the viewer.
 */
export const debatesHubMatchesOnlyAtom = atomWithStorage('debatesHubMatchesOnly', true);

/**
 * "Hide my positions" on the debates hub's Explore tab (GEO-2863).
 *
 * On by default, which is the collapse the tab shipped with — browsing is about finding something
 * new, and a claim you have taken a side on sits in the way of the next one forever. The switch is
 * what says so: the same behaviour with nothing on screen to explain it read as the list throwing
 * rows away, which is the report that produced it.
 *
 * Two atoms rather than one shared setting, because the two surfaces do not mean the same thing by
 * it — see {@link rematchHideMyPositionsAtom}. They agree on the default and disagree about what
 * happens to a claim answered under the viewer, which is the part that matters.
 */
export const debatesHubHideMyPositionsAtom = atomWithStorage('debatesHubHideMyPositions', true);

/** Profiles show the full record by default; remember an explicit choice to browse unanswered claims. */
export const profileHideMyPositionsAtom = atomWithStorage('profileHideMyPositions', false);

/**
 * "Hide my positions" on the debate-again flow's Explore tab (GEO-2863).
 *
 * Stored rather than session-scoped, and on by default. Stored because the complaint it answers is
 * chronic rather than momentary: a reader with a long backlog of positions is hunting for new
 * claims across visits, not for one afternoon.
 *
 * On because it gives the page's tabs one job each. The claims it hides are the ones this page can
 * act on — `debateRequestGate` refuses a request from someone holding no position — but those are
 * also what the Matches tab is made of (GEO-3148), which is exactly "what we can go again on right
 * now". Explore is then the other half of the flow: finding a claim to take a side on. Nothing
 * becomes unreachable, because a claim only the viewer has answered cannot be requested from either
 * tab — the gate needs both sides.
 */
export const rematchHideMyPositionsAtom = atomWithStorage('rematchHideMyPositions', true);

/**
 * "Hide agreed" on the debate-again flow's "Their positions" tab.
 *
 * The opponent has a side on every claim there, so each row is one of three things to the viewer:
 * the other side (a match, requestable now), no side yet (one press from a match), or the same side.
 * Only the last is a dead end — there is nothing to debate — and this is what takes it out.
 *
 * Not "Hide my positions", which on this tab would also hide the matches: the rows the viewer can act
 * on soonest. Stored and on by default for the same reasons as {@link rematchHideMyPositionsAtom}.
 */
export const rematchHideAgreedAtom = atomWithStorage('rematchHideAgreed', true);

/**
 * GEO-3489. Which Today's claims sections the viewer opened or closed in the debate-again picker,
 * with the agenda day they did it on: a choice holds for that day and the next day's agenda starts
 * every section at its default again. Read through `useTodaysSectionsOpen`.
 */
export const todaysClaimsSectionsAtom = atomWithStorage<{ day: string | null; open: Record<string, boolean> }>(
  'todaysClaimsSections',
  { day: null, open: {} }
);

/**
 * GEO-3498. The day's Today's claims callout, per account: the claims it asks about, which were
 * answered or skipped there, and whether it was dismissed. One copy for the side panel and the
 * full-screen hub, so answering in one counts in the other; per account, so someone else signing in
 * on the same browser doesn't reset it. Read through `useTodaysCallout`.
 */
export const todaysClaimsCalloutAtom = atomWithStorage<Record<string, CalloutDay>>('todaysClaimsCallout', {});

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
// A visible focus home when mobile ranking fullscreen hides the app navbar.
export const rankingFullscreenFocusTargetAtom = atom<HTMLElement | null>(null);

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
