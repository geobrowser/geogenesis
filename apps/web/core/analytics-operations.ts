import { type ActionContext, type ActionKind } from './action-context';
import { analyticsContextRevision, capture } from './analytics';
import { ReceiptConfirmationTimeoutError } from './errors';

/** Only classify outcomes that prove the action did not execute. Network and
 * receipt timeouts remain unknown: retrying those could duplicate a landed write.
 * Emit an allowlisted category, never the provider message or request payload.
 */
export function classifyOperationFailure(error: unknown): 'rejected' | 'unavailable' | 'unknown' {
  let classification: 'rejected' | 'unavailable' | 'unknown' = 'unknown';
  for (let current = error, depth = 0; current != null && depth < 10; depth++) {
    if (typeof current !== 'object') break;
    // A receipt query may itself be rejected. That does not undo the submission,
    // even if a surrounding wrapper copied the cause's message or code.
    if (current instanceof ReceiptConfirmationTimeoutError) return 'unknown';
    const failure = current as { code?: unknown; cause?: unknown };
    if (failure.code === 4001) classification = 'rejected';
    if (current instanceof Error) {
      if (current.name === 'QueuedSendTimeoutError') classification = 'unavailable';
      if (/user rejected/i.test(current.message)) classification = 'rejected';
    }
    current = failure.cause;
  }
  return classification;
}

/** Queue wait and depth from a QueuedSendTimeoutError anywhere in the cause chain. */
export function queueTimeoutMetrics(error: unknown): { queue_wait_ms: number; queue_depth: number } | undefined {
  for (let current = error, depth = 0; current != null && depth < 10; depth++) {
    if (current instanceof Error && current.name === 'QueuedSendTimeoutError') {
      const { waitedMs, queueDepth } = current as Error & { waitedMs?: unknown; queueDepth?: unknown };
      if (typeof waitedMs === 'number' && typeof queueDepth === 'number') {
        return { queue_wait_ms: waitedMs, queue_depth: queueDepth };
      }
      return undefined;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export type OperationContext = { opportunity_id: string; presentation_instance_id: string };

/** One logical client attempt; transport retries reuse the SDK's immutable event ID. */
export function observeOperation(
  action: ActionKind,
  targetType: string,
  targetId: string,
  opportunity?: OperationContext,
  attribution?: ActionContext
) {
  const operationId = crypto.randomUUID();
  const readRevision = () => {
    try {
      return analyticsContextRevision();
    } catch {
      return null;
    }
  };
  const contextRevision = readRevision();
  const context = {
    ...attribution,
    measurement_version: 'growth-v2',
    action_context_version: 'v1',
    operation_id: operationId,
    action_kind: action,
    target_type: attribution?.target_type ?? targetType,
    target_id: attribution?.target_id ?? targetId,
    ...opportunity,
  };
  const emitted = new Set<string>();
  let completed = false;
  const emit = (event: string, phase: string, properties: Record<string, unknown>) => {
    if (emitted.has(`${event}:${phase}`)) return;
    // Source reconciliation owns completion after logout/account switch. Never
    // assign an earlier actor's asynchronous result to the current account.
    if (readRevision() !== contextRevision) return;
    emitted.add(`${event}:${phase}`);
    try {
      capture(event, { ...properties, ...context });
    } catch {
      /* Never fail a product action. */
    }
  };
  const complete = (outcome: 'succeeded' | 'failed' | 'unknown', properties: Record<string, unknown> = {}) => {
    if (completed) return;
    completed = true;
    if (attribution) emit('action_completed', 'complete', { ...properties, outcome });
  };
  if (opportunity) emit('action_attempted', 'attempt', {});
  return {
    operationId,
    succeeded(properties: Record<string, unknown> = {}) {
      complete('succeeded', properties);
    },
    /** `metrics` is numbers only, so no provider text or payload can reach analytics. */
    failed(
      code: 'rejected' | 'unavailable' | 'invalid_input' | 'publish_failed' | 'unknown',
      metrics?: Record<string, number>
    ) {
      if (completed) return;
      complete(code === 'unknown' ? 'unknown' : 'failed', { ...metrics, failure_code: code });
      if (['vote', 'ranking', 'publish'].includes(action))
        emit(code === 'unknown' ? 'action_outcome_unknown' : 'action_failed', code, {
          ...metrics,
          failure_code: code,
        });
    },
    outcome(
      event: 'vote_cast' | 'ranking_submitted',
      phase: 'submitted' | 'indexed',
      properties: Record<string, unknown>
    ) {
      if (phase === 'submitted') complete('succeeded', properties);
      emit(event, phase, { ...properties, outcome_phase: phase });
    },
  };
}

/** Observe an async application operation without changing its result or errors. */
export async function runObservedAction<T>(
  action: ActionKind,
  context: ActionContext,
  run: () => Promise<T>
): Promise<T> {
  const operation = observeOperation(action, context.target_type, context.target_id, undefined, context);
  try {
    const result = await run();
    operation.succeeded();
    return result;
  } catch (error) {
    operation.failed(classifyOperationFailure(error));
    throw error;
  }
}

/** Synchronous actions (navigation, local editing, message dispatch). */
export function recordAction(action: ActionKind, context: ActionContext, properties: Record<string, unknown> = {}) {
  observeOperation(action, context.target_type, context.target_id, undefined, context).succeeded(properties);
}
