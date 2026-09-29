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
import { equals } from './id/normalize';

const Context = React.createContext<ActionScope>({});
const DepthContext = React.createContext(0);
const MeasurementContext = React.createContext<React.RefObject<HTMLElement | null> | null>(null);
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
  const ref = React.useRef<HTMLElement>(null);
  const pageId = React.useSyncExternalStore(subscribeToActionPageViews, getPageViewId, getServerPageViewId);
  const key = [
    pageId,
    value.component,
    value.target_id,
    value.list_id ?? parent.list_id,
    value.item_position ?? parent.item_position,
  ].join(':');
  if (seenPage !== pageId) {
    seen.clear();
    instances.clear();
    seenPage = pageId;
  }
  if (!instances.has(key)) instances.set(key, crypto.randomUUID());
  const instance = instances.get(key)!;
  const context = { ...mergeActionScope(parent, value), ...value, presentation_instance_id: instance };
  const latest = React.useRef(context);
  latest.current = context;
  React.useEffect(() => {
    if (
      !trackImpression ||
      !IMPRESSION_COMPONENTS.has(value.component) ||
      !ref.current ||
      typeof IntersectionObserver === 'undefined'
    )
      return;
    if (seenPage !== pageId) {
      seen.clear();
      seenPage = pageId;
    }
    let visible = false;
    const record = () => {
      if (!visible || document.visibilityState !== 'visible' || seen.has(key)) return;
      seen.add(key);
      const current = latest.current;
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
    observer.observe(className === 'contents' ? (ref.current.firstElementChild ?? ref.current) : ref.current);
    document.addEventListener('visibilitychange', record);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', record);
    };
  }, [className, key, pageId, value.component, trackImpression]);
  const enter = () => enterActionContext({ ...pageContext(), ...context }, depth);
  return (
    <DepthContext.Provider value={depth}>
      <Context.Provider value={context}>
        {asChild ? (
          <MeasurementContext.Provider value={ref}>{children}</MeasurementContext.Provider>
        ) : (
          <div
            ref={node => {
              ref.current = node;
            }}
            className={className}
            onClickCapture={enter}
            onSubmitCapture={enter}
          >
            {children}
          </div>
        )}
      </Context.Provider>
    </DepthContext.Provider>
  );
}

/** Preserve the feed's existing article root, refs and :last-child selectors. */
export function ActionSurfaceArticle({ ref: forwardedRef, onClickCapture, ...props }: React.ComponentProps<'article'>) {
  const measurement = React.useContext(MeasurementContext);
  const context = React.useContext(Context);
  const depth = React.useContext(DepthContext);
  const attach = React.useCallback(
    (node: HTMLElement | null) => {
      if (measurement) measurement.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [measurement, forwardedRef]
  );
  return (
    <article
      {...props}
      ref={attach}
      onClickCapture={event => {
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
      }}
    />
  );
}
