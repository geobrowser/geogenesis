'use client';

import * as React from 'react';

import { type OpportunityEligibility, createRankingOpportunity } from './analytics-opportunities';

export function useRankingOpportunity(rankingId: string, eligibility: OpportunityEligibility, reason: string) {
  const root = React.useRef<HTMLDivElement>(null);
  const [epoch, setEpoch] = React.useState(0);
  const opportunity = React.useMemo(() => createRankingOpportunity(rankingId), [rankingId, epoch]);
  React.useEffect(() => {
    const reset = (event: Event) => {
      if ((event as Event & { resetEpoch?: boolean }).resetEpoch !== false) setEpoch(value => value + 1);
    };
    window.addEventListener('geo-analytics-context-changing', reset);
    return () => window.removeEventListener('geo-analytics-context-changing', reset);
  }, []);
  React.useEffect(() => {
    opportunity.eligibility(eligibility, reason);
  }, [opportunity, eligibility, reason]);
  React.useEffect(() => {
    const element = root.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const visible = new Set<Element>();
    const observed = new Set<Element>();
    const tick = () =>
      opportunity.visibility(
        performance.now(),
        document.visibilityState === 'visible' && document.hasFocus() && [...visible].some(node => node.isConnected)
      );
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) visible.add(entry.target);
          else visible.delete(entry.target);
        }
        tick();
      },
      { threshold: [0, 0.5] }
    );
    const discover = () => {
      for (const node of observed)
        if (!node.isConnected) {
          observer.unobserve(node);
          observed.delete(node);
          visible.delete(node);
        }
      for (const node of element.querySelectorAll('[data-analytics-feature="ranking-submit"]')) {
        if (!observed.has(node)) {
          observed.add(node);
          observer.observe(node);
        }
      }
    };
    discover();
    const mutation = new MutationObserver(discover);
    mutation.observe(element, { childList: true, subtree: true });
    const timer = window.setInterval(tick, 250);
    const hide = () => opportunity.visibility(performance.now(), false);
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('blur', hide);
    return () => {
      observer.disconnect();
      mutation.disconnect();
      window.clearInterval(timer);
      hide();
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('blur', hide);
    };
  }, [opportunity]);
  return { root, context: opportunity.context };
}
