'use client';

import * as React from 'react';

import {
  type ActionComponent,
  type ActionScope,
  enterActionContext,
  pageContext,
  snapshotActionContext,
} from './action-context';
import { capture } from './analytics';

const Context = React.createContext<ActionScope>({});
const MeasurementContext = React.createContext<React.RefObject<HTMLElement | null> | null>(null);
const seen = new Set<string>();
const instances = new Map<string, string>();
let seenPage = '';
const IMPRESSION_COMPONENTS = new Set<ActionComponent>([
  'explore_feed_card',
  'debate_player',
  'debate_claim_ticker',
  'debate_end_card',
  'debate_claims_panel',
]);

/** Scopes follow React portals, so a modal preserves its underlying page/list. */
export function ActionContextProvider({ value, children }: { value: ActionScope; children: React.ReactNode }) {
  const parent = React.useContext(Context);
  return <Context.Provider value={{ ...parent, ...value }}>{children}</Context.Provider>;
}

export function useActionContext(
  component: ActionComponent,
  targetType: string,
  targetId: string,
  extra: ActionScope = {}
) {
  const scope = React.useContext(Context);
  const latest = React.useRef({ scope, extra });
  latest.current = { scope, extra };
  return React.useCallback(() => {
    const { scope, extra } = latest.current;
    return snapshotActionContext(
      component,
      targetType === 'entity' && scope.target_id === targetId ? (scope.target_type ?? targetType) : targetType,
      targetId,
      { ...scope, origin_entity_ids: scope.target_id === targetId ? scope.origin_entity_ids : undefined },
      extra
    );
  }, [component, targetType, targetId]);
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
  const ref = React.useRef<HTMLElement>(null);
  const pageId = pageContext().page_view_id;
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
  const context = { ...parent, ...value, presentation_instance_id: instance };
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
        ...snapshotActionContext(current.component, current.target_type, current.target_id, current),
        measurement_version: 'growth-v2',
        action_context_version: 'v1',
      });
    };
    const observer = new IntersectionObserver(
      entries => {
        visible = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.5);
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
  const enter = () => enterActionContext({ ...pageContext(), ...context });
  return (
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
  );
}

/** Preserve the feed's existing article root, refs and :last-child selectors. */
export function ActionSurfaceArticle({ ref: forwardedRef, onClickCapture, ...props }: React.ComponentProps<'article'>) {
  const measurement = React.useContext(MeasurementContext);
  const context = React.useContext(Context);
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
          enterActionContext({
            ...pageContext(),
            ...context,
            component: context.component,
            target_id: context.target_id,
            target_type: context.target_type,
          });
        onClickCapture?.(event);
      }}
    />
  );
}
