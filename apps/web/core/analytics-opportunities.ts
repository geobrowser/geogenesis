import { type AnalyticsEventName, capture } from './analytics';

export type OpportunityEligibility = 'eligible' | 'authentication_required' | 'ineligible';
/** The deploy a `feature_exposed` row came from, which the event requires. */
export const ANALYTICS_BUILD_ID =
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_BUILD_ID || 'unversioned';

export const rankingFeature = {
  feature_id: 'ranking-submit',
  feature_version: 'ranking-compose-v1',
  build_id: ANALYTICS_BUILD_ID,
  exposure_rule: 'foreground-control-50pct-1s-v1',
};

/**
 * One chance to act, shown to someone: an `opportunity_id` that the attempt and the completion carry
 * too, so "offered → pressed → done" joins up. `eligibility` reports whether it could be taken, once
 * per change. Ranking's compose box and the claim page's Request debate button (GEO-3244) are two.
 */
export function createActionOpportunity({
  actionKind,
  targetType,
  targetId,
  properties,
}: {
  actionKind: string;
  targetType: string;
  targetId: string;
  /** Sent with every event about this opportunity, such as where it was shown. */
  properties?: Record<string, unknown>;
}) {
  const instance = crypto.randomUUID();
  const context = { opportunity_id: instance, presentation_instance_id: instance };
  const extra = properties ?? {};
  let state = '';
  const emit = (name: AnalyticsEventName, properties: Record<string, unknown>) => {
    try {
      capture(name, { ...extra, ...properties, ...context, measurement_version: 'growth-v2' });
    } catch {
      /* Optional telemetry. */
    }
  };
  return {
    context,
    emit,
    eligibility(eligibility: OpportunityEligibility, reason: string) {
      const next = `${eligibility}:${reason}`;
      if (state === next) return;
      state = next;
      emit('action_opportunity', {
        action_kind: actionKind,
        target_type: targetType,
        target_id: targetId,
        eligibility,
        eligibility_reason: reason,
      });
    },
  };
}

export function createRankingOpportunity(rankingId: string) {
  const opportunity = createActionOpportunity({ actionKind: 'ranking', targetType: 'ranking', targetId: rankingId });
  const instance = opportunity.context.opportunity_id;
  let visibleSince: number | null = null;
  let exposed = false;
  const emit = opportunity.emit;
  return {
    context: opportunity.context,
    eligibility: opportunity.eligibility,
    visibility(now: number, visible: boolean) {
      if (!visible) {
        visibleSince = null;
        return;
      }
      if (visibleSince === null) visibleSince = now;
      if (!exposed && now - visibleSince >= 1000) {
        exposed = true;
        emit('feature_exposed', { ...rankingFeature, exposure_id: instance, target_id: rankingId });
      }
    },
  };
}
