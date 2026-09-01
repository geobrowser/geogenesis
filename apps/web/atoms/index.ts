import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

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

export type DebatesHubTab = 'requests' | 'matches' | 'claims' | 'people';

/** `null` while the debates matchmaking hub is closed. */
export const debatesHubAtom = atom<{ tab: DebatesHubTab } | null>(null);

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
