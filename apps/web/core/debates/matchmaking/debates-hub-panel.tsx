'use client';

import * as React from 'react';

import cx from 'classnames';
import { MotionConfig, motion } from 'framer-motion';
import { useAtomValue, useSetAtom } from 'jotai';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';

import { ActionContextProvider } from '~/core/action-context-provider';
import { DEBATES_MODAL } from '~/core/debates/debates-panel-deep-link';
import { requestsModal } from '~/core/deep-links/modal-deep-link';
import { useIsMobileLayout } from '~/core/hooks/use-is-mobile-layout';
import { useMobileSheetDrag } from '~/core/hooks/use-mobile-sheet-drag';

import { Calendar } from '~/design-system/icons/calendar';
import { CloseSmall } from '~/design-system/icons/close-small';
import { ExpandSmall } from '~/design-system/icons/expand-small';
import { MobileSheetSurface } from '~/design-system/mobile-sheet-surface';
import { Badge, tabGroupTabLinkStyles } from '~/design-system/tab-group';
import { Text } from '~/design-system/text';
import { ElevatedPopoverPortalContext } from '~/design-system/use-elevated-popover-portal';

import { useDebateActivity, useGeoChatAuth } from '../hooks';
import { useLobbyLineup } from '../lobbies/live-lobbies';
import { useDebateRequests, useMatchmakingMatches, useMatchmakingScope } from './hooks';
import { hubAnalyticsAttributes } from './hub-analytics';
import { HubAskProvider } from './hub-ask-context';
import { HubHeaderControls } from './hub-header-controls';
import { HubLiveStrip } from './hub-live-strip';
import { HubSwap } from './hub-motion';
import { hubClosesOnArrivalAt } from './hub-navigation';
import { HUB_ICON_BUTTON_CLASS_NAME, hubPillClassName } from './hub-pill-button';
import { NoTimesNudge } from './no-times-nudge';
import { PanelExploreTab, PanelMatchesTab } from './panel-claim-tabs';
import { PeopleTab } from './people-tab';
import { RequestsTab } from './requests-tab';
import { ScrollableTabRow } from './scrollable-tab-row';
import { SIGNED_OUT_TABS } from './signed-out-tabs';
import { useCalendarHref } from './use-calendar-href';
import { useDebatesHub } from './use-debates-hub';
import { useFocusTrap } from './use-focus-trap';
import { useHubFilterOwner } from './use-hub-filter-owner';
import { useRequestsTabCount } from './use-requests-tab-count';
import { isWorkspaceList, useWorkspaceQuery, workspaceHref } from './use-workspace-query';
import { type DebatesHubTab, debatesHubExploreShowAtom } from '~/atoms';

// The hub sits below the navbar (h-11) rather than covering it, so the toggle that opened it stays
// visible and clickable. Mobile falls back to the bottom-sheet pattern used by the entity panel.
const MOBILE_SHEET_TOP_OFFSET_PX = 120;

// GEO-3463: four tabs, People first. Who is around comes before what to debate, because People is
// the tab people actually use most (52 of 66 panel users, 30 Sep–13 Oct); then the claims you could
// debate now, then everything else, then what is waiting on you. "Live" became Matches — it always
// listed claims, never lobbies — and "My positions" became one of Explore's Shows.
//
// The ids stay the ones links and the full-screen hub already use: `lobby` is the matches list
// (`?tab=matches` was renamed onto it long ago), and `positions` still opens, on Explore's Show.
// The landing tab is `DEFAULT_TAB` in use-debates-hub, which agrees with this order.
const TABS: { id: DebatesHubTab; label: string }[] = [
  { id: 'people', label: 'People' },
  { id: 'lobby', label: 'Matches' },
  { id: 'explore', label: 'Explore' },
  { id: 'requests', label: 'Requests' },
];

// Which tabs exist signed out, and why, is in `./signed-out-tabs`: the debates link reads it too.

function tabsFor(authenticated: boolean) {
  if (authenticated) return TABS;

  return SIGNED_OUT_TABS.flatMap(id => TABS.filter(tab => tab.id === id));
}

/**
 * Signing out with Lobby or Requests open would otherwise leave the panel on a tab that is no
 * longer in the row, showing a tab body with no tab selected.
 */
function visibleTab(activeTab: DebatesHubTab, authenticated: boolean): DebatesHubTab {
  if (authenticated || SIGNED_OUT_TABS.includes(activeTab)) return activeTab;
  return 'people';
}

export function DebatesHubPanel() {
  const isMobile = useIsMobileLayout();
  const [popoverContainer, setPopoverContainer] = React.useState<HTMLDivElement | null>(null);
  const { isOpen, activeTab, close, setTab } = useDebatesHub();
  const { setOverlayElement, sheetStyle, sheetControlsRef, sheet } = useMobileSheetDrag({
    enabled: isMobile && isOpen,
    onDismiss: close,
    peekTopPx: MOBILE_SHEET_TOP_OFFSET_PX,
  });
  // Held here rather than per tab, so switching tabs doesn't drop and re-take the gateway scope.
  useMatchmakingScope(isOpen);
  // Only the mobile sheet claims `aria-modal`; the desktop aside is a non-modal companion panel.
  const sheetRef = useFocusTrap(isOpen && isMobile);
  const pathname = usePathname();
  const lastPathnameRef = React.useRef(pathname);
  // Read during render, while the trigger is still in the URL: `useDeepLinkEffect` strips it in an
  // effect, so by the time effects run the answer would depend on which of the two ran first.
  const requestedByLink = requestsModal(useSearchParams(), DEBATES_MODAL);

  // The hub follows the viewer while they browse and stops at the door of a debate (GEO-2788),
  // on the layout where it can — see the mobile branch below.
  //
  // It used to close on every navigation. That made the Claims tab a dead end — following a claim
  // shut the list you were working through — so `hubClosesOnArrivalAt` names the two rooms it must
  // not sit on top of instead, and everywhere else keeps it. Only on a change: closing on mount
  // would shut the panel the moment it opened.
  React.useEffect(() => {
    if (lastPathnameRef.current === pathname) return;
    lastPathnameRef.current = pathname;
    // Not when the destination is itself asking for the hub: `?modal=debates` reached by
    // client-side navigation changes the pathname too, and closing here would undo the open the
    // link just did. Decided from the render's params rather than from effect order, so the link
    // wins whether this effect runs before or after `DeepLinkHandler`'s — and whether or not the
    // hub was already open when the viewer followed it.
    //
    // Kept ahead of the route test rather than folded into it: a link that explicitly asks for the
    // hub should win even where the route would otherwise close it, which is what makes
    // `?modal=debates` a way to open the hub anywhere rather than a way to open it in most places.
    if (requestedByLink) return;
    // Desktop only. The hub is a companion column there, so the destination is visible beside it —
    // which is the whole premise of keeping it open. On mobile it is a full-screen `aria-modal`
    // sheet over a backdrop, so persisting would navigate the page *behind* an opaque overlay:
    // the viewer taps a claim, nothing appears to happen, and the page they landed on is hidden
    // from assistive tech until they dismiss the sheet by hand. Closing is what makes the tap
    // arrive somewhere.
    if (!isMobile && !hubClosesOnArrivalAt(pathname)) return;
    close();
  }, [close, isMobile, pathname, requestedByLink]);

  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return;
      // Radix menus preventDefault their own Escape, but the hand-rolled debate modals (request
      // popup, share prompt) don't — without this the hub would close invisibly behind them.
      // Mirrors the outside-pointerdown exclusions below; `:not` spares the mobile sheet itself.
      if (document.querySelector('[role="dialog"][aria-modal="true"]:not([data-debates-hub])')) return;
      event.preventDefault();
      close();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, close]);

  // Close on outside pointer-down. Capture phase so it beats descendants that stopPropagation;
  // the navbar toggle and portaled popovers/menus are excluded so they can own their own behavior.
  React.useEffect(() => {
    if (!isOpen || isMobile) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest(
          '[data-debates-hub], [data-debates-hub-opener], [data-radix-popper-content-wrapper], [data-radix-portal], [role="dialog"], [role="menu"], [role="listbox"], .elevated-popover'
        )
      ) {
        return;
      }
      close();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [isOpen, isMobile, close]);

  if (!isOpen) return null;
  if (typeof document === 'undefined' || !document.body) return null;

  // Only the sheet gets a close button. `aria-modal` hides the rest of the page from assistive
  // tech, so the navbar toggle that opened it is out of reach and the backdrop below is
  // deliberately not an announced control — leaving Escape, which a phone rarely has, as the only
  // way out. The desktop aside is non-modal, so its toggle stays reachable and the design's
  // header stands.
  const body = (
    <ActionContextProvider value={{ overlay: 'debates_hub_sheet', component: 'debate_matchmaking' }}>
      {/* One reading of the open ask for every card, row and the strip (GEO-3463). */}
      <HubAskProvider>
        <DebatesHubSurface activeTab={activeTab} onTabChange={setTab} onClose={isMobile ? close : undefined} />
      </HubAskProvider>
    </ActionContextProvider>
  );

  if (isMobile) {
    return createPortal(
      // Scoped to the hub rather than a global MotionConfig, which would silently retune every
      // animation in the app. `user` keeps opacity fades but drops transform and layout motion.
      <MotionConfig reducedMotion="user">
        <motion.div
          ref={setOverlayElement}
          className="fixed inset-0 z-[200] overscroll-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
        >
          {/* Not a button: `aria-modal` hides it from assistive tech anyway, so labelling it
              "Close" only promised a control nobody could hear about — the header's button is the
              announced one. Tapping outside still closes, which is what this is for. */}
          <div aria-hidden className="absolute inset-0 bg-grey-04/50" onClick={close} />
          <MobileSheetSurface
            ref={sheetRef as React.RefObject<HTMLDivElement>}
            tabIndex={-1}
            data-debates-hub
            role="dialog"
            aria-modal="true"
            aria-label="Debates"
            sheetStyle={sheetStyle}
            sheetControlsRef={sheetControlsRef}
            sheet={sheet}
          >
            <ElevatedPopoverPortalContext.Provider value={popoverContainer}>
              {body}
            </ElevatedPopoverPortalContext.Provider>
            <div ref={setPopoverContainer} />
          </MobileSheetSurface>
        </motion.div>
      </MotionConfig>,
      document.body
    );
  }

  return createPortal(
    <MotionConfig reducedMotion="user">
      <aside
        data-debates-hub
        aria-label="Debates"
        className="shadow-2xl fixed top-11 right-0 bottom-0 z-[200] flex w-[min(400px,100vw)] shrink-0 flex-col overflow-hidden border-l border-grey-02 bg-white"
      >
        {body}
      </aside>
    </MotionConfig>,
    document.body
  );
}

type SurfaceProps = {
  activeTab: DebatesHubTab;
  onTabChange: (tab: DebatesHubTab) => void;
  /** Mobile only — see the call site. */
  onClose?: () => void;
};

function DebatesHubSurface({ activeTab: requestedTab, onTabChange, onClose }: SurfaceProps) {
  const { authenticated, ready, accountKey } = useGeoChatAuth();
  const filtersReconciled = useHubFilterOwner(accountKey, ready);
  const tabs = tabsFor(authenticated);
  const activeTab = visibleTab(requestedTab, authenticated);
  // GEO-3431: a link's scheduled request, which only this Requests tab (not the live rail's) shows.
  const { focusedRequestId } = useDebatesHub();
  const { data: activity } = useDebateActivity(authenticated);
  const { data: requests } = useDebateRequests(authenticated);

  const requestCount = useRequestsTabCount({ authenticated, activity, requests });
  // How many matches are online now, quietly beside the tab's name (the Panel-Matches board). The
  // same query Matches reads, so opening the tab costs nothing more.
  const { data: matches } = useMatchmakingMatches(authenticated);
  const matchCount = matches?.matches.length ?? 0;
  const lobbyLineup = useLobbyLineup();
  const setExploreShow = useSetAtom(debatesHubExploreShowAtom);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  // The availability pill, which the schedule editor hands focus back to when it closes.
  const scheduleButtonRef = React.useRef<HTMLButtonElement | null>(null);

  // One scroll container is shared by all four tabs, so a scrolled People list would otherwise
  // leave Requests scrolled to the same offset.
  const changeTab = React.useCallback(
    (tab: DebatesHubTab) => {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      onTabChange(tab);
    },
    [onTabChange]
  );

  // "My positions" is a Show on Explore now (GEO-3463). A link or an older caller asking for the
  // positions tab lands there with it chosen, rather than on a tab that no longer exists.
  // Signed out there are no positions to show, so it is plain Explore.
  React.useEffect(() => {
    if (requestedTab !== 'positions' || !ready) return;
    if (authenticated) setExploreShow('mine');
    onTabChange('explore');
  }, [authenticated, onTabChange, ready, requestedTab, setExploreShow]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-4 pb-3">
        <Text as="h2" variant="smallTitle">
          Debates
        </Text>
        <HubHeaderControls scheduleButtonRef={scheduleButtonRef}>
          <CalendarButton />
          {onClose ? (
            <button
              type="button"
              data-geo-analytics-label="Close debate hub"
              data-geo-analytics-intent="close_debates_hub"
              aria-label="Close debates"
              onClick={onClose}
              className={HUB_ICON_BUTTON_CLASS_NAME}
            >
              <CloseSmall />
            </button>
          ) : null}
        </HubHeaderControls>
      </div>

      {/* At most one 44px strip before the tabs, and none at all when there is nothing for it to say
          (GEO-3463). The lobby spotlight, the upcoming lobbies card and the schedule banner used to
          stack here — about 520px at an 800px window before the first person or claim. */}
      <HubLiveStrip lineup={lobbyLineup} />

      {/* Hidden until Privy resolves, not just the body below it. `authenticated` is false during
          restoration, so a row drawn before then is the signed-out one — a returning viewer would
          watch Matches and Requests appear, and a selected tab of theirs jump to Claims. */}
      <div className={cx('shrink-0 px-4', !ready && 'invisible')} aria-hidden={!ready}>
        {/* The row is `w-max` so the labels never compress, and both panel shells are
            `overflow-hidden` — so on a narrow phone whichever tab sits last would simply be cut
            off. It scrolls instead, with a fade and an arrow on whichever side has more (GEO-3148).
            The four tabs (GEO-3463) fit the panel's 400px at the design's 18px gap with the
            Requests badge showing, so the arrows only appear on a very narrow phone. */}
        <ScrollableTabRow activeKey={activeTab} analyticsLabelPrefix="Debate hub" className="gap-[18px]">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              {...hubAnalyticsAttributes(`${tab.label} tab`, 'navigate_debates_hub')}
              aria-current={activeTab === tab.id ? 'true' : undefined}
              data-tab-active={activeTab === tab.id ? 'true' : undefined}
              onClick={() => changeTab(tab.id)}
              className={tabGroupTabLinkStyles({ active: activeTab === tab.id })}
            >
              {tab.label}
              {tab.id === 'lobby' && matchCount > 0 ? (
                <span className="text-breadcrumb font-medium text-grey-04">
                  {matchCount}
                  <span className="sr-only"> online</span>
                </span>
              ) : null}
              {tab.id === 'requests' && requestCount > 0 ? (
                <Badge>
                  {requestCount}
                  <span className="sr-only"> pending requests</span>
                </Badge>
              ) : null}
              {activeTab === tab.id && (
                <motion.div
                  layoutId="debates-hub-tab-active-border"
                  layout
                  initial={false}
                  transition={{ duration: 0.2 }}
                  className="absolute right-0 bottom-[-8px] left-0 z-100 h-px bg-text"
                />
              )}
            </button>
          ))}
        </ScrollableTabRow>
      </div>

      {/* layoutScroll tells Motion to account for this element's scroll offset when it measures
          card positions — without it, reordering a scrolled list animates from the wrong place. */}
      <motion.div
        layoutScroll
        ref={scrollRef}
        data-debates-hub-scroll
        data-mobile-sheet-scroll
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6"
      >
        {/* `filtersReconciled` joins the Privy gate rather than becoming a second one: the reset
            below runs in a passive effect, so the render that first sees a new account still holds
            the previous one's filter bar. Rendering the tabs then would show B the labels A had
            picked and fire B's first query with A's space ids, an instant before the effect
            corrects both. One render, but it is the wrong viewer's data. */}
        {!ready || !filtersReconciled ? null : (
          <>
            {/* Upcoming lobbies are not above any tab any more (GEO-3463): the next one is in the strip,
                the ones the viewer is going to are in Requests, and all of them are on the calendar. */}
            <HubSwap activeKey={activeTab}>
              {activeTab === 'requests' ? (
                <RequestsTab focusedRequestId={focusedRequestId} />
              ) : activeTab === 'lobby' ? (
                <PanelMatchesTab onTabChange={changeTab} />
              ) : activeTab === 'explore' || activeTab === 'positions' ? (
                <PanelExploreTab onTabChange={changeTab} />
              ) : (
                <PeopleTab onTabChange={changeTab} />
              )}
            </HubSwap>
            {/* Explore's four serial round trips, started from whichever tab the viewer is on
                instead of from the moment they ask for Explore — see `ClaimsTab`'s `warm`. The panel
                opens on People and Explore is one press away, so the chain has the whole time
                the viewer spends reading this tab to finish, and usually has.

                Inside the readiness gate above for the reason that gate exists: warming with the
                previous account's filter bar would fill the cache under the wrong viewer's query
                keys, which is worse than not warming at all.

                Dropped once Explore is the open tab, so the real one is the only instance holding
                the selection atoms and geo-chat's space scopes. */}
            {activeTab === 'explore' ? null : <PanelExploreTab warm onTabChange={changeTab} />}
          </>
        )}
      </motion.div>

      {!ready || !filtersReconciled ? null : <NoTimesNudge scheduleButtonRef={scheduleButtonRef} />}
      {!ready || !filtersReconciled ? null : <ExpandToWorkspaceLink activeTab={activeTab} />}
    </div>
  );
}

/**
 * Calendar (GEO-3152): everyone's free time as a full-screen week. The panel closes on the way, so
 * it does not sit over the week it opened; "Back to Debates" there brings it back on this page.
 *
 * The header's only calendar icon, so it always means everyone's week; your own times are under
 * the availability pill beside it. Icon-only on a phone, where the sheet also carries Close.
 */
function CalendarButton() {
  const { close } = useDebatesHub();
  const href = useCalendarHref();
  return (
    <Link
      href={href}
      onClick={close}
      aria-label="Calendar"
      data-geo-analytics-label="Debate hub Calendar"
      data-geo-analytics-intent="open_debate_calendar"
      className={hubPillClassName('secondary', 'gap-1.5 md:w-7 md:px-0 [&_svg]:shrink-0')}
    >
      <Calendar />
      <span className="md:sr-only">Calendar</span>
    </Link>
  );
}

/**
 * The way out to the full-screen hub, carrying the list on this tab and what narrows it. Explore on
 * My positions is full screen's positions list, which still has a list of its own there. Several
 * picked spaces stay behind, since full screen would read them as any of them — see
 * `useWorkspaceQuery`.
 */
function ExpandToWorkspaceLink({ activeTab }: { activeTab: DebatesHubTab }) {
  const { close } = useDebatesHub();
  const { authenticated } = useGeoChatAuth();
  const show = useAtomValue(debatesHubExploreShowAtom);
  const list = activeTab === 'explore' && authenticated && show === 'mine' ? 'positions' : activeTab;
  // The panel tab's own selection, which is what is on screen (GEO-3463).
  const query = useWorkspaceQuery(
    isWorkspaceList(list) ? list : null,
    activeTab === 'lobby' ? 'panelMatches' : 'panelExplore'
  );

  return (
    <div className="shrink-0 border-t border-grey-02 px-4 py-2.5">
      <Link
        href={workspaceHref(query)}
        onClick={close}
        className="flex items-center justify-center gap-1.5 text-metadata text-grey-04 transition-colors hover:text-text"
      >
        <ExpandSmall />
        Open full screen
      </Link>
    </div>
  );
}
