import { analyticsContextRevision, capture } from './analytics';

export type OperationContext = { opportunity_id: string; presentation_instance_id: string };

/** One logical client attempt; transport retries reuse the SDK's immutable event ID. */
export function observeOperation(
  action: 'vote' | 'ranking' | 'publish',
  targetType: string,
  targetId: string,
  opportunity?: OperationContext
) {
  const operationId = crypto.randomUUID();
  const contextRevision = analyticsContextRevision();
  const context = {
    measurement_version: 'growth-v2',
    operation_id: operationId,
    action_kind: action,
    target_type: targetType,
    target_id: targetId,
    ...opportunity,
  };
  const emitted = new Set<string>();
  const emit = (event: string, phase: string, properties: Record<string, unknown>) => {
    if (emitted.has(`${event}:${phase}`)) return;
    // Source reconciliation owns completion after logout/account switch. Never
    // assign an earlier actor's asynchronous result to the current account.
    if (analyticsContextRevision() !== contextRevision) return;
    emitted.add(`${event}:${phase}`);
    try {
      capture(event, { ...properties, ...context });
    } catch {
      /* Never fail a product action. */
    }
  };
  if (opportunity) emit('action_attempted', 'attempt', {});
  return {
    operationId,
    failed(code: 'rejected' | 'unavailable' | 'invalid_input' | 'publish_failed' | 'unknown') {
      emit(code === 'unknown' ? 'action_outcome_unknown' : 'action_failed', code, { failure_code: code });
    },
    outcome(
      event: 'vote_cast' | 'ranking_submitted',
      phase: 'submitted' | 'indexed',
      properties: Record<string, unknown>
    ) {
      emit(event, phase, { ...properties, outcome_phase: phase });
    },
  };
}
