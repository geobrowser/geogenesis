import { type ActionContext, type ActionKind } from './action-context';
import { type AnalyticsEventName, analyticsContextRevision, capture } from './analytics';
import { authAttemptForAction, completeAuthAction } from './auth-attempt';
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

/**
 * Why an operation did not do what it was asked. `conflict` is a refusal that arrives as an ordinary
 * answer rather than an error: geo-chat declining to book a debate that clashes with another.
 */
export type OperationFailureCode =
  'rejected' | 'unavailable' | 'invalid_input' | 'publish_failed' | 'conflict' | 'unknown';

// Canonical outcomes accept only the IDs, fixed categories and measurements used
// by our producers. Legacy outcome bags may also contain human-readable labels.
const CANONICAL_OUTCOME_FIELDS = new Set([
  'vote_direction',
  'vote_kind',
  'mutation_kind',
  'vote_action',
  'previous_vote_direction',
  'response_kind',
  'response_action',
  'entity_id',
  'space_id',
  'object_type',
  'user_operation_hash',
  'vote_id',
  'local_vote_count',
  'drop_reason',
  'winner_id',
  'previous_winner_id',
  'ranking_id',
  'rank_id',
  'item_count',
  'content_id',
  'target_entity_ids',
  'value_count',
  'relation_count',
  'comment_id',
  'created_space_id',
  'result_count',
  'method',
  'edit_scope',
  'edit_action',
  'queue_wait_ms',
  'queue_depth',
  'failure_code',
  // GEO-3244: the debate request a send created, and what an accept led to.
  'request_id',
  'debate_id',
  'rematch_session_id',
]);

/** Actions an `opportunity_id` in scope is an offer of: the claim page's Request debate (GEO-3244). */
const OPPORTUNITY_ACTIONS = new Set<ActionKind>(['start_debate']);

/**
 * A refusal the server answered with: its own code, such as geo-chat's `recipient_away`, for a
 * request the server received and declined. Such a request did not execute, so it is a failure,
 * not an unknown — counting it as unknown made a blocked request read as a network error (GEO-3244).
 *
 * Read structurally rather than by class, so this module stays free of any one client's imports:
 * an error carrying a string `code` and a 4xx `status`. Only the code is kept, never the message.
 */
export function serverRefusalCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const { code, status } = error as { code?: unknown; status?: unknown };
  if (typeof code !== 'string' || !code) return null;
  return typeof status === 'number' && status >= 400 && status < 500 ? code : null;
}

/**
 * Taken when an asynchronous action starts. The returned check is false once the analytics identity
 * has changed (logout, account switch), after which that action's result belongs to nobody present:
 * source reconciliation owns it, and it must not be captured under the current account.
 */
export function snapshotAnalyticsRevision(): () => boolean {
  const readRevision = () => {
    try {
      return analyticsContextRevision();
    } catch {
      return null;
    }
  };
  const contextRevision = readRevision();
  return () => readRevision() === contextRevision;
}

/** One logical client attempt; transport retries reuse the SDK's immutable event ID. */
export function observeOperation(
  action: ActionKind,
  targetType: string,
  targetId: string,
  opportunity?: OperationContext,
  attribution?: ActionContext
) {
  const operationId = crypto.randomUUID();
  const authAttempt = authAttemptForAction(action, targetId, attribution?.auth_attempt_id);
  const isCurrent = snapshotAnalyticsRevision();
  const context = {
    measurement_version: 'growth-v2',
    operation_id: operationId,
    action_kind: action,
    target_type: targetType,
    target_id: targetId,
    ...opportunity,
  };
  const emitted = new Set<string>();
  let completed = false;
  const emit = (event: AnalyticsEventName, phase: string, properties: Record<string, unknown>) => {
    if (emitted.has(`${event}:${phase}`)) return;
    // Source reconciliation owns completion after logout/account switch. Never
    // assign an earlier actor's asynchronous result to the current account.
    if (!isCurrent()) return;
    emitted.add(`${event}:${phase}`);
    try {
      capture(event, {
        ...properties,
        ...context,
        // Only canonical completions carry page/surface attribution. Legacy events
        // keep their original target type and opportunity/display IDs for existing consumers.
        ...(event === 'action_completed'
          ? {
              ...attribution,
              auth_attempt_id: attribution?.auth_attempt_id ?? authAttempt?.id,
              action_context_version: 'v1',
            }
          : {}),
      });
    } catch {
      /* Never fail a product action. */
    }
  };
  const complete = (outcome: 'succeeded' | 'failed' | 'unknown', properties: Record<string, unknown> = {}) => {
    if (completed) return;
    completed = true;
    const canonical = Object.fromEntries(
      Object.entries(properties).filter(([key]) => CANONICAL_OUTCOME_FIELDS.has(key))
    );
    if (attribution) emit('action_completed', 'complete', { ...canonical, outcome });
    if (authAttempt && isCurrent()) completeAuthAction(authAttempt, outcome, operationId);
  };
  if (opportunity) emit('action_attempted', 'attempt', {});
  return {
    operationId,
    isCurrent,
    succeeded(properties: Record<string, unknown> = {}) {
      complete('succeeded', properties);
    },
    /**
     * `metrics` is numbers only, so no provider text or payload can reach analytics. `refusalCode`
     * names the server's own reason on the completion; the legacy failure events keep `code`.
     */
    failed(code: OperationFailureCode, metrics?: Record<string, number>, refusalCode?: string) {
      if (completed) return;
      complete(code === 'unknown' ? 'unknown' : 'failed', { ...metrics, failure_code: refusalCode ?? code });
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

/**
 * Observe an async application operation without changing its result or errors. `failureOf` names a
 * failure the result carries without throwing; the caller still receives that result.
 */
export async function runObservedAction<T>(
  action: ActionKind,
  context: ActionContext,
  run: () => Promise<T>,
  failureOf?: (result: T) => OperationFailureCode | null,
  /** What the result says about the outcome, such as the id it created; canonical fields only. */
  resultProperties?: (result: T) => Record<string, unknown>
): Promise<T> {
  // An action taken from an opportunity is also an attempt at it (GEO-3244). Only the action the
  // opportunity offers: a scope carries its id to everything inside, and the collector checks
  // `action_attempted`'s kind, so accepting an invite on a calendar opened from an offer is not one.
  const opportunity =
    context.opportunity_id && OPPORTUNITY_ACTIONS.has(action)
      ? {
          opportunity_id: context.opportunity_id,
          presentation_instance_id: context.presentation_instance_id ?? context.opportunity_id,
        }
      : undefined;
  const operation = observeOperation(action, context.target_type, context.target_id, opportunity, context);
  try {
    const result = await run();
    const failure = failureOf?.(result) ?? null;
    if (failure) operation.failed(failure);
    else operation.succeeded(resultProperties?.(result));
    return result;
  } catch (error) {
    const refusal = serverRefusalCode(error);
    if (refusal) operation.failed('rejected', undefined, refusal);
    else operation.failed(classifyOperationFailure(error));
    throw error;
  }
}

/** Synchronous actions (navigation, local editing, message dispatch). */
export function recordAction(action: ActionKind, context: ActionContext, properties: Record<string, unknown> = {}) {
  observeOperation(action, context.target_type, context.target_id, undefined, context).succeeded(properties);
}
