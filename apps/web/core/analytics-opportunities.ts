import { capture } from './analytics';

export type OpportunityEligibility = 'eligible' | 'authentication_required' | 'ineligible';
export const rankingFeature = {
  feature_id: 'ranking-submit',
  feature_version: 'ranking-compose-v1',
  build_id: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_BUILD_ID || 'unversioned',
  exposure_rule: 'foreground-control-50pct-1s-v1',
};

export function createRankingOpportunity(rankingId: string) {
  const instance = crypto.randomUUID();
  const context = { opportunity_id: instance, presentation_instance_id: instance };
  let state = '';
  let visibleSince: number | null = null;
  let exposed = false;
  const emit = (name: string, properties: Record<string, unknown>) => {
    try {
      capture(name, { ...properties, ...context, measurement_version: 'growth-v2' });
    } catch {
      /* Optional telemetry. */
    }
  };
  return {
    context,
    eligibility(eligibility: OpportunityEligibility, reason: string) {
      const next = `${eligibility}:${reason}`;
      if (state === next) return;
      state = next;
      emit('action_opportunity', {
        action_kind: 'ranking',
        target_type: 'ranking',
        target_id: rankingId,
        eligibility,
        eligibility_reason: reason,
      });
    },
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
