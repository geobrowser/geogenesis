'use client';

import * as React from 'react';

import cx from 'classnames';
import { MotionConfig, type PanInfo, motion, useDragControls } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';

import { useIsMobileLayout } from '~/core/hooks/use-is-mobile-layout';

import { CloseSmall } from '~/design-system/icons/close-small';
import { Badge, tabGroupTabLinkStyles } from '~/design-system/tab-group';
import { Text } from '~/design-system/text';

import { useDebateActivity, useGeoChatAuth, useUpdateDebateAvailability } from '../hooks';
import { ClaimsTab } from './claims-tab';
import { useDebateRequests, useMatchmakingScope } from './hooks';
import { HubSwap } from './hub-motion';
import { HubMessage } from './hub-states';
import { MatchesTab } from './matches-tab';
import { PeopleTab } from './people-tab';
import { RequestsTab } from './requests-tab';
import { useDebatesHub } from './use-debates-hub';
import { useFocusTrap } from './use-focus-trap';
import { useUnexpiredRequests } from './use-request-countdown';
import type { DebatesHubTab } from '~/atoms';

// The hub sits below the navbar (h-11) rather than covering it, so the toggle that opened it stays
// visible and clickable. Mobile falls back to the bottom-sheet pattern used by the entity panel.
const MOBILE_SHEET_TOP_OFFSET_PX = 120;
const PANEL_SCROLL_SELECTOR = '[data-debates-hub-scroll]';

const TABS: { id: DebatesHubTab; label: string }[] = [
  { id: 'requests', label: 'Requests' },
  { id: 'matches', label: 'Matches' },
  { id: 'claims', label: 'Claims' },
  { id: 'people', label: 'People' },
];

function isInteractiveDragTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'button, a, input, textarea, select, [role="button"], [contenteditable="true"], [data-no-sheet-drag]'
    )
  );
}

function shouldStartSheetDrag(event: React.PointerEvent, root: HTMLElement): boolean {
  if (isInteractiveDragTarget(event.target)) return false;
  const scrollEl = root.querySelector<HTMLElement>(PANEL_SCROLL_SELECTOR);
  if (scrollEl?.contains(event.target as Node) && scrollEl.scrollTop > 0) return false;
  return true;
}

export function DebatesHubPanel() {
  const isMobile = useIsMobileLayout();
  const dragControls = useDragControls();
  const { isOpen, activeTab, close, setTab } = useDebatesHub();
  // Held here rather than per tab, so switching tabs doesn't drop and re-take the gateway scope.
  useMatchmakingScope(isOpen);
  // Only the mobile sheet claims `aria-modal`; the desktop aside is a non-modal companion panel.
  const sheetRef = useFocusTrap(isOpen && isMobile);
  const pathname = usePathname();
  const lastPathnameRef = React.useRef(pathname);

  // Anything that navigates has taken the viewer somewhere they asked to go — accepting a request
  // walks them into the debate room — and the panel would otherwise sit on top of it. Only on a
  // change: closing on mount would shut the panel the moment it opened.
  React.useEffect(() => {
    if (lastPathnameRef.current === pathname) return;
    lastPathnameRef.current = pathname;
    close();
  }, [close, pathname]);

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
  const body = <DebatesHubSurface activeTab={activeTab} onTabChange={setTab} onClose={isMobile ? close : undefined} />;

  if (isMobile) {
    return createPortal(
      // Scoped to the hub rather than a global MotionConfig, which would silently retune every
      // animation in the app. `user` keeps opacity fades but drops transform and layout motion.
      <MotionConfig reducedMotion="user">
        <motion.div
          className="fixed inset-0 z-[200]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          onPointerDown={event => {
            if (shouldStartSheetDrag(event, event.currentTarget)) dragControls.start(event);
          }}
        >
          {/* Not a button: `aria-modal` hides it from assistive tech anyway, so labelling it
              "Close" only promised a control nobody could hear about — the header's button is the
              announced one. Tapping outside still closes, which is what this is for. */}
          <div aria-hidden className="absolute inset-0 bg-grey-04/50" onClick={close} />
          <motion.div
            ref={sheetRef as React.RefObject<HTMLDivElement>}
            tabIndex={-1}
            data-debates-hub
            role="dialog"
            aria-modal="true"
            aria-label="Debates"
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.12}
            onDragEnd={(_event, info: PanInfo) => {
              if (info.offset.y > 72 || info.velocity.y > 420) close();
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="rounded-t-2xl shadow-2xl absolute inset-x-0 bottom-0 z-1 flex flex-col overflow-hidden bg-white"
            style={{ top: MOBILE_SHEET_TOP_OFFSET_PX }}
          >
            <div className="flex shrink-0 justify-center pt-2 pb-1" aria-hidden>
              <div className="h-1 w-10 rounded-full bg-grey-02" />
            </div>
            {body}
          </motion.div>
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

function DebatesHubSurface({ activeTab, onTabChange, onClose }: SurfaceProps) {
  const { authenticated, ready } = useGeoChatAuth();
  const { data: activity } = useDebateActivity(authenticated);
  const { data: requests } = useDebateRequests(authenticated);

  const incoming = useUnexpiredRequests(requests?.incoming ?? []);
  const requestCount = requests ? incoming.length : (activity?.incoming_request_count ?? 0);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // One scroll container is shared by all four tabs, so a scrolled People list would otherwise
  // leave Requests scrolled to the same offset.
  const changeTab = React.useCallback(
    (tab: DebatesHubTab) => {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      onTabChange(tab);
    },
    [onTabChange]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-4 pb-3">
        <Text as="h2" variant="smallTitle">
          Debates
        </Text>
        <div className="flex min-w-0 items-center gap-1">
          <AvailabilityToggle />
          {onClose ? (
            <button
              type="button"
              aria-label="Close debates"
              onClick={onClose}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-grey-04 transition-colors hover:bg-grey-01 hover:text-text"
            >
              <CloseSmall />
            </button>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 px-4">
        <div className="relative">
          <div className="relative flex w-max items-center gap-6 pb-2">
            {TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                aria-current={activeTab === tab.id ? 'true' : undefined}
                onClick={() => changeTab(tab.id)}
                className={tabGroupTabLinkStyles({ active: activeTab === tab.id })}
              >
                {tab.label}
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
          </div>
          <div className="absolute right-0 bottom-0 left-0 z-0 h-px bg-grey-02" />
        </div>
      </div>

      {/* layoutScroll tells Motion to account for this element's scroll offset when it measures
          card positions — without it, reordering a scrolled list animates from the wrong place. */}
      <motion.div
        layoutScroll
        ref={scrollRef}
        data-debates-hub-scroll
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6"
      >
        {!ready ? null : !authenticated ? (
          <HubMessage>Sign in to find people to debate.</HubMessage>
        ) : (
          <HubSwap activeKey={activeTab}>
            {activeTab === 'requests' ? (
              <RequestsTab />
            ) : activeTab === 'matches' ? (
              <MatchesTab onTabChange={changeTab} />
            ) : activeTab === 'claims' ? (
              <ClaimsTab />
            ) : (
              <PeopleTab />
            )}
          </HubSwap>
        )}
      </motion.div>
    </div>
  );
}

function AvailabilityToggle() {
  const { authenticated } = useGeoChatAuth();
  const { data: activity } = useDebateActivity(authenticated);
  const updateAvailability = useUpdateDebateAvailability();

  const available = activity?.available_to_debate ?? false;

  if (!authenticated) return null;

  return (
    <button
      type="button"
      role="switch"
      // Without this the switch announces "Unavailable, off", which is ambiguous about which way
      // pressing it goes.
      aria-label="Available to debate"
      aria-checked={available}
      disabled={updateAvailability.isPending}
      onClick={() => updateAvailability.mutate(!available)}
      className={cx(
        'flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-metadataMedium transition-colors disabled:cursor-wait',
        available ? 'bg-green/15 text-green' : 'bg-grey-01 text-grey-04'
      )}
    >
      <span>{available ? "I'm available" : 'Unavailable'}</span>
      <span
        aria-hidden="true"
        className={cx(
          'relative h-4 w-6 shrink-0 rounded-full transition-colors',
          available ? 'bg-green' : 'bg-grey-03'
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white transition-transform',
            available && 'translate-x-2'
          )}
        />
      </span>
    </button>
  );
}
