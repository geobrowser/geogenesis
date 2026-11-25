'use client';

import * as React from 'react';

import { pageContext } from '~/core/action-context';
import { captureSafely } from '~/core/analytics-capture-safely';
import { currentNavigationType } from '~/core/utils/navigation-type';

import type { GraphKind } from './graph-kinds';
import { graphShareLanding, takeGraphExplorerEntry } from './graph-share';

// Graph explorer events (GEO-3826), registered in geobrowser/analytics. Sent unstamped: never
// `measurement_version`, `source`, `session_id`, `name` or `duration*`, and no names or search text.

export type GraphEntry = 'shared_link' | 'in_app' | 'reload' | 'history' | 'external_link' | 'direct' | 'internal_link';
export type GraphLoadOutcome = 'ready' | 'error' | 'not_in_graph';
export type RecentreMethod = 'node' | 'search' | 'panel' | 'summary' | 'back' | 'trail' | 'history';
export type GraphExit = 'close' | 'open_claim' | 'open_entity' | 'navigated' | 'page_hidden';
type Interaction =
  | { interaction: 'rotate' }
  | { interaction: 'zoom'; value: 'gesture' | 'buttons' }
  | { interaction: 'filter'; value: string }
  | { interaction: 'search'; result_count: number }
  | { interaction: 'summary_seen' }
  /** The path's "…" opened. Its own integer, as search's count is: `value` is a string elsewhere. */
  | { interaction: 'trail_menu'; step_count: number }
  | { interaction: 'open_page'; value: 'claim' | 'entity'; target_id: string };

/** An `open_page` click this soon before leaving is why the viewer left. */
const OPEN_EXIT_MS = 2_000;
/** A popstate this soon before the mount means the viewer came by Back or Forward. */
const POPSTATE_MS = 1_000;

let lastPopstate = -Infinity;
/** Sessions that opened in this document; one that unmounted before loading does not count. */
let sessionsThisDocument = 0;
if (typeof window !== 'undefined') window.addEventListener('popstate', () => (lastPopstate = Date.now()));

type EntrySignals = {
  share: { share_id: string; method: string } | null;
  inApp: 'topic_page' | null;
  navigationType: string;
  /** The document was loaded on this explorer URL and no explorer session ran before in it. */
  firstRoute: boolean;
  popstate: boolean;
  externalReferrer: boolean;
};

export function classifyEntry(signals: EntrySignals): GraphEntry {
  if (signals.share) return 'shared_link';
  if (signals.inApp) return 'in_app';
  if (signals.popstate) return 'history';
  if (signals.firstRoute) {
    if (signals.navigationType === 'reload') return 'reload';
    if (signals.navigationType === 'back_forward') return 'history';
    return signals.externalReferrer ? 'external_link' : 'direct';
  }
  return 'internal_link';
}

function documentPath() {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return null;
  const [entry] = performance.getEntriesByType('navigation');
  try {
    return entry ? new URL(entry.name).pathname : null;
  } catch {
    return null;
  }
}

function externalReferrer() {
  try {
    return Boolean(document.referrer) && new URL(document.referrer).origin !== window.location.origin;
  } catch {
    return false;
  }
}

export type GraphSessionInit = { entityId: string; topicId: string; spaceId: string | null; trailDepth: number };

/**
 * What the runtime derives from the URL at capture time; undefined drops a value the destination
 * page's URL would add (`/space/<id>/…` sets space_id).
 */
const ROUTE_IDS = {
  space_id: undefined,
  story_id: undefined,
  timeline_id: undefined,
  episode_id: undefined,
  source_id: undefined,
  governance_view_kind: undefined,
  governance_proposal_id: undefined,
};

export type GraphExplorerSession = ReturnType<typeof startGraphExplorerSession>;

/** One explorer mount: hops keep it, a reload or a return from another page starts a new one. */
export function startGraphExplorerSession(
  init: GraphSessionInit,
  now: () => number = Date.now,
  /** Restored from the back/forward cache: entry history, and no load to time. */
  restored = false
) {
  const mountedAt = now();
  const pathAtMount = window.location.pathname;
  const popstate = mountedAt - lastPopstate <= POPSTATE_MS;

  const id = crypto.randomUUID();
  let centre = init.entityId;
  const centres = new Set([centre]);
  let maxTrailDepth = init.trailDepth;
  let hops = 0;
  let openedAt: number | null = null;
  let readyMs: number | null = null;
  let activeMs = 0;
  let visibleSince: number | null = null;
  let ended = false;
  let tagged: { method: RecentreMethod; target: string; kind?: GraphKind } | null = null;
  let markedExit: GraphExit | null = null;
  let lastOpen: { at: number; kind: 'claim' | 'entity'; target: string } | null = null;
  const once = new Set<string>();
  /** The explorer's latest page: `left` can fire after the app moved to another page. */
  let explorerPage: Record<string, unknown> | null = null;
  const notePage = () => {
    const page = pageContext();
    if (page.page_type !== 'graph_explorer') return;
    explorerPage = {
      ...page,
      page_url: window.location.href,
      page_search: window.location.search,
      page_hash: window.location.hash,
      page_name: document.title,
    };
  };

  const base = () => ({
    graph_session_id: id,
    entity_id: centre,
    topic_id: init.topicId,
    ...(init.spaceId ? { space_id: init.spaceId } : {}),
  });
  const sinceOpen = () => (openedAt === null ? {} : { ms_since_open: Math.max(0, Math.round(now() - openedAt)) });
  const onVisibility = () => {
    if (document.visibilityState === 'visible') visibleSince ??= now();
    else if (visibleSince !== null) {
      activeMs += now() - visibleSince;
      visibleSince = null;
    }
  };

  return {
    id,
    /** The first centre settled: drawn, failed or missing. Sent once. */
    opened(
      outcome: GraphLoadOutcome,
      extra: { entityKind?: GraphKind; layout: 'phone' | 'desktop'; trailDepth: number }
    ) {
      if (openedAt !== null || ended) return;
      notePage();
      openedAt = now();
      if (outcome === 'ready' && !restored) readyMs = Math.round(openedAt - mountedAt);
      visibleSince = document.visibilityState === 'visible' ? openedAt : null;
      document.addEventListener('visibilitychange', onVisibility);
      const landing = graphShareLanding();
      const share = landing ? { share_id: landing.share_id, method: landing.method } : null;
      const inApp = restored ? null : takeGraphExplorerEntry();
      const entry: GraphEntry = restored
        ? 'history'
        : classifyEntry({
            share,
            inApp,
            navigationType: currentNavigationType(),
            firstRoute: sessionsThisDocument === 0 && documentPath() === pathAtMount,
            popstate,
            externalReferrer: externalReferrer(),
          });
      sessionsThisDocument++;
      captureSafely('graph_explorer_opened', {
        ...base(),
        entry,
        load_outcome: outcome,
        ...(restored ? {} : { ready_ms: Math.max(0, Math.round(openedAt - mountedAt)) }),
        layout: extra.layout,
        trail_depth: extra.trailDepth,
        ...(extra.entityKind ? { entity_kind: extra.entityKind } : {}),
        ...(entry === 'in_app' && inApp ? { entry_point: inApp } : {}),
        ...(share ? { share_id: share.share_id, share_method: share.method } : {}),
      });
    },
    /** How the next hop to `target` was asked for; a hop nobody tagged was browser history. */
    tag(method: RecentreMethod, target: string, kind?: GraphKind) {
      tagged = { method, target, kind };
    },
    recentred(entityId: string, extra: { trailDepth: number; kindFilter: string }) {
      if (ended || entityId === centre) return;
      const from = centre;
      notePage();
      const tag = tagged?.target === entityId ? tagged : null;
      tagged = null;
      centre = entityId;
      centres.add(entityId);
      hops++;
      maxTrailDepth = Math.max(maxTrailDepth, extra.trailDepth);
      captureSafely('graph_explorer_recentred', {
        ...base(),
        from_entity_id: from,
        method: tag?.method ?? 'history',
        hop_index: hops,
        trail_depth: extra.trailDepth,
        centres: centres.size,
        kind_filter: extra.kindFilter,
        ...(tag?.kind ? { entity_kind: tag.kind } : {}),
        ...sinceOpen(),
      });
    },
    /** Rotate and zoom once per centre and summary_seen once; the rest as they happen. */
    interacted(event: Interaction) {
      if (ended) return;
      if (event.interaction === 'rotate' || event.interaction === 'zoom') {
        const key = `${event.interaction}:${centre}`;
        if (once.has(key)) return;
        once.add(key);
      }
      if (event.interaction === 'summary_seen') {
        if (once.has('summary_seen')) return;
        once.add('summary_seen');
      }
      if (event.interaction === 'open_page') lastOpen = { at: now(), kind: event.value, target: event.target_id };
      notePage();
      captureSafely('graph_explorer_interacted', { ...base(), ...event, ...sinceOpen() });
    },
    markExit(exit: GraphExit) {
      markedExit = exit;
    },
    /** Sent once, and only for a session that opened. */
    left(cause: 'page_hidden' | 'unmount') {
      if (ended) return;
      ended = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (openedAt === null) return;
      const at = now();
      if (visibleSince !== null) activeMs += at - visibleSince;
      const open = lastOpen && at - lastOpen.at <= OPEN_EXIT_MS ? lastOpen : null;
      const exit: GraphExit =
        cause === 'page_hidden'
          ? 'page_hidden'
          : (markedExit ?? (open ? (open.kind === 'claim' ? 'open_claim' : 'open_entity') : 'navigated'));
      captureSafely('graph_explorer_left', {
        ...ROUTE_IDS,
        ...explorerPage,
        ...base(),
        exit,
        hops,
        active_ms: Math.max(0, Math.round(activeMs)),
        centres: centres.size,
        max_trail_depth: maxTrailDepth,
        time_in_view_ms: Math.max(0, Math.round(at - openedAt)),
        ...(open && (exit === 'open_claim' || exit === 'open_entity') ? { target_id: open.target } : {}),
        ...(readyMs !== null ? { ready_ms: readyMs } : {}),
      });
    },
  };
}

const GraphAnalyticsContext = React.createContext<GraphExplorerSession | null>(null);
export const GraphAnalyticsProvider = GraphAnalyticsContext.Provider;

/** The explorer session, or null outside one (tests, other surfaces): callers use `?.`. */
export function useGraphAnalytics() {
  return React.useContext(GraphAnalyticsContext);
}

/**
 * Starts a session on mount; it leaves on unmount, `beforeunload` or `pagehide`, whichever comes
 * first, and a page restored from the back/forward cache starts a new one.
 */
export function useGraphExplorerSession(init: GraphSessionInit) {
  const latest = React.useRef(init);
  React.useEffect(() => {
    latest.current = init;
  });
  const [session, setSession] = React.useState<GraphExplorerSession | null>(null);
  React.useEffect(() => {
    let current = startGraphExplorerSession(latest.current);
    setSession(current);
    const hide = () => current.left('page_hidden');
    const show = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      current.left('page_hidden');
      current = startGraphExplorerSession(latest.current, Date.now, true);
      setSession(current);
    };
    // An event captured at `beforeunload` reaches the runtime's stored outbox before the page goes,
    // and is sent later; one captured at `pagehide` is lost. `pagehide` stays for browsers that
    // skip `beforeunload` (iOS Safari).
    window.addEventListener('beforeunload', hide);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    return () => {
      window.removeEventListener('beforeunload', hide);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
      current.left('unmount');
    };
  }, []);
  return session;
}
