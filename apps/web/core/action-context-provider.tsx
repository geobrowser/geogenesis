'use client';

import * as React from 'react';

import {
  type ActionComponent,
  type ActionScope,
  enterActionContext,
  mergeActionScope,
  pageContext,
  snapshotActionContext,
  subscribeToActionPageViews,
} from './action-context';
import { capture } from './analytics';
import { seenStore } from './explore/seen-demotion/seen-store';
import { equals } from './id/normalize';

const Context = React.createContext<ActionScope>({});
const DepthContext = React.createContext(0);
const MeasurementContext = React.createContext<((node: HTMLElement | null) => void) | null>(null);
const seen = new Set<string>();
const instances = new Map<string, string>();
let seenPage = '';
const getPageViewId = () => pageContext().page_view_id;
const getServerPageViewId = () => '';
const IMPRESSION_COMPONENTS = new Set<ActionComponent>([
  'explore_feed_card',
  'debate_player',
  'debate_claim_ticker',
  'debate_end_card',
  'debate_claims_panel',
]);

/**
 * GEO-3234. Explore cards feed the browser's seen store: an impression is a view, and any click
 * inside the card (open, vote, join, play) is engagement, which exempts it from seen demotion.
 * Both are queued in memory and written when the browser is idle.
 */
function noteExploreCardImpression(context: ActionScope, pageViewId: string) {
  if (context.component === 'explore_feed_card' && context.target_id) {
    seenStore().recordImpression(context.target_id, pageViewId);
  }
}

function noteExploreCardEngagement(context: ActionScope) {
  if (context.component === 'explore_feed_card' && context.target_id) seenStore().recordEngagement(context.target_id);
}

/** Read inherited attribution when a reusable component supplies optional overrides. */
export function useActionScope() {
  return React.useContext(Context);
}

/** Scopes follow React portals, so a modal preserves its underlying page/list. */
export function ActionContextProvider({ value, children }: { value: ActionScope; children: React.ReactNode }) {
  const parent = React.useContext(Context);
  const depth = React.useContext(DepthContext) + 1;
  return (
    <DepthContext.Provider value={depth}>
      <Context.Provider value={mergeActionScope(parent, value)}>{children}</Context.Provider>
    </DepthContext.Provider>
  );
}

export function useActionContext(
  component: ActionComponent,
  targetType: string,
  targetId: string,
  extra: ActionScope = {}
) {
  const scope = React.useContext(Context);
  const depth = React.useContext(DepthContext);
  const latest = React.useRef({ scope, extra, depth });
  latest.current = { scope, extra, depth };
  return React.useCallback(
    (target?: ActionScope & { target_type: string; target_id: string }) => {
      const { scope, extra, depth } = latest.current;
      const id = target?.target_id ?? targetId;
      const type = target?.target_type ?? targetType;
      return snapshotActionContext(
        component,
        type === 'entity' && scope.target_id && equals(scope.target_id, id) ? (scope.target_type ?? type) : type,
        id,
        scope,
        { ...extra, ...target },
        { scopeDepth: depth }
      );
    },
    [component, targetType, targetId]
  );
}

/** A real box is needed for intersection measurement. No off-screen mount impressions. */
export function ActionSurface({
  value,
  children,
  className,
  trackImpression = true,
  asChild = false,
}: {
  value: ActionScope & { component: ActionComponent; target_id: string; target_type: string };
  children: React.ReactNode;
  className?: string;
  trackImpression?: boolean;
  asChild?: boolean;
}) {
  const parent = React.useContext(Context);
  const depth = React.useContext(DepthContext) + 1;
  const [root, setRoot] = React.useState<HTMLElement | null>(null);
  const [contentsNode, setContentsNode] = React.useState<Element | null>(null);
  const measureContents = !asChild && className === 'contents';
  // A display:contents wrapper has no box. Its child can replace itself without
  // rerendering this surface, just like an asChild article resolving its fallback.
  React.useLayoutEffect(() => {
    if (!measureContents || !root) return;
    const update = () => setContentsNode(root.firstElementChild);
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { childList: true });
    return () => observer.disconnect();
  }, [measureContents, root]);
  const measurementNode = measureContents ? contentsNode : root;
  const pageId = React.useSyncExternalStore(subscribeToActionPageViews, getPageViewId, getServerPageViewId);
  const key = [
    pageId,
    value.component,
    value.target_id,
    value.list_id ?? parent.list_id,
    value.item_position ?? parent.item_position,
  ].join(':');
  if (pageId && seenPage !== pageId) {
    seen.clear();
    instances.clear();
    seenPage = pageId;
  }
  // The server/hydration snapshot has no page ID. Do not retain entities across requests.
  if (pageId && !instances.has(key)) instances.set(key, crypto.randomUUID());
  const instance = pageId ? instances.get(key) : undefined;
  const context = { ...mergeActionScope(parent, value), ...value, presentation_instance_id: instance };
  const latest = React.useRef(context);
  latest.current = context;
  React.useEffect(() => {
    if (
      !pageId ||
      !trackImpression ||
      !IMPRESSION_COMPONENTS.has(value.component) ||
      !measurementNode ||
      typeof IntersectionObserver === 'undefined'
    )
      return;
    if (seenPage !== pageId) {
      seen.clear();
      seenPage = pageId;
    }
    let visible = false;
    let active = true;
    const record = () => {
      if (!active || !visible || document.visibilityState !== 'visible' || seen.has(key)) return;
      seen.add(key);
      const current = latest.current;
      noteExploreCardImpression(current, pageId);
      capture('component_impression', {
        ...snapshotActionContext(
          current.component,
          current.target_type,
          current.target_id,
          current,
          {},
          { ignoreEventContext: true }
        ),
        measurement_version: 'growth-v2',
        action_context_version: 'v1',
      });
    };
    const observer = new IntersectionObserver(
      entries => {
        const entry = entries[entries.length - 1];
        if (entry) visible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
        record();
      },
      { threshold: [0, 0.5] }
    );
    observer.observe(measurementNode);
    document.addEventListener('visibilitychange', record);
    return () => {
      active = false;
      observer.disconnect();
      document.removeEventListener('visibilitychange', record);
    };
  }, [measurementNode, key, pageId, value.component, trackImpression]);
  const enter = () => {
    noteExploreCardEngagement(context);
    enterActionContext({ ...pageContext(), ...context }, depth);
  };
  return (
    <DepthContext.Provider value={depth}>
      <Context.Provider value={context}>
        {asChild ? (
          <MeasurementContext.Provider value={setRoot}>{children}</MeasurementContext.Provider>
        ) : (
          <div ref={setRoot} className={className} onClickCapture={enter} onSubmitCapture={enter}>
            {children}
          </div>
        )}
      </Context.Provider>
    </DepthContext.Provider>
  );
}

/** Share measurement and capture behavior while preserving each surface's existing DOM root. */
function useActionSurfaceRoot<T extends HTMLElement>(
  forwardedRef: React.Ref<T> | undefined,
  onClickCapture: React.MouseEventHandler<T> | undefined
) {
  const measurement = React.useContext(MeasurementContext);
  const context = React.useContext(Context);
  const depth = React.useContext(DepthContext);
  const attach = React.useCallback(
    (node: T | null) => {
      measurement?.(node);
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [measurement, forwardedRef]
  );
  return {
    ref: attach,
    onClickCapture: (event: React.MouseEvent<T>) => {
      noteExploreCardEngagement(context);
      if (context.component && context.target_id && context.target_type)
        enterActionContext(
          {
            ...pageContext(),
            ...context,
            component: context.component,
            target_id: context.target_id,
            target_type: context.target_type,
          },
          depth
        );
      onClickCapture?.(event);
    },
  };
}

/** Preserve the feed's existing article root, refs and :last-child selectors. */
export function ActionSurfaceArticle({ ref, onClickCapture, ...props }: React.ComponentProps<'article'>) {
  const root = useActionSurfaceRoot(ref, onClickCapture);
  return <article {...props} {...root} />;
}

/** Preserve div roots used for scroll geometry and ResizeObserver measurements. */
export function ActionSurfaceDiv({ ref, onClickCapture, ...props }: React.ComponentProps<'div'>) {
  const root = useActionSurfaceRoot(ref, onClickCapture);
  return <div {...props} {...root} />;
}
