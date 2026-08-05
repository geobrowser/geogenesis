import type { DebateClaimInput, DebatePublishInput } from '../debate-publish-draft';

/**
 * Debate claim extraction: drive the generalized `claims.extract` DAG (extraction-api) over a
 * finished debate's transcript and map the result back to per-turn claims for
 * {@link buildDebatePublishDraft}.
 *
 * Attribution is STRUCTURAL, not LLM-inferred: each turn is submitted as its own document, and the
 * returned claim's first `document_indices` entry is the turn it came from — whose text block
 * carries the speaker via its Authors relation. The extractor only pulls claims from text.
 *
 * Non-fatal by design: extraction being disabled, unconfigured, slow, or failing returns `[]`, and
 * the debate still publishes without claims.
 */

const EXTRACTION_TASK_TYPE = 'claims.extract';
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 120_000;
/** claims.extract accepts at most 50 documents; we send one per turn. */
const MAX_TURNS = 50;

type ExtractionConfig = {
  enabled: boolean;
  baseUrl: string;
  apiKey?: string;
};

type ExtractedClaim = {
  text?: string;
  document_indices?: number[];
  is_factual?: boolean | null;
};

type ClaimsExtractResult = {
  claims?: ExtractedClaim[];
};

type TaskStatusResponse = {
  status?: string;
  result?: ClaimsExtractResult;
  error?: string;
};

function readConfig(): ExtractionConfig {
  return {
    enabled: process.env.DEBATE_CLAIM_EXTRACTION_ENABLED === 'true',
    baseUrl: (process.env.EXTRACTION_API_URL ?? '').replace(/\/+$/, ''),
    apiKey: process.env.EXTRACTION_API_KEY?.trim() || undefined,
  };
}

function nonEmptyTurns(input: DebatePublishInput): DebatePublishInput['transcriptTurns'] {
  return input.transcriptTurns.filter(turn => turn.text.trim().length > 0);
}

function buildContext(input: DebatePublishInput): string {
  const sides = [...input.participants]
    .sort((a, b) => a.participantSlot - b.participantSlot)
    .map(p => `${p.displayName?.trim() || 'Anonymous'} (${p.position ? 'supporting' : 'opposing'})`);
  return `Debate motion: ${input.claimText.trim()}. Participants: ${sides.join(', ')}.`;
}

export async function extractDebateClaims(input: DebatePublishInput): Promise<DebateClaimInput[]> {
  const config = readConfig();
  if (!config.enabled) return [];
  if (!config.baseUrl) {
    console.warn('[debate-claims] DEBATE_CLAIM_EXTRACTION_ENABLED is set but EXTRACTION_API_URL is not; skipping.');
    return [];
  }

  // Same filter buildDebatePublishDraft applies, so a claim's turnIndex lines up with its text block.
  const turns = nonEmptyTurns(input);
  if (turns.length === 0) return [];
  if (turns.length > MAX_TURNS) {
    console.warn(
      `[debate-claims] debate ${input.debateId} has ${turns.length} turns (> ${MAX_TURNS}); claim extraction skipped.`
    );
    return [];
  }

  const sideBySpaceEntity = new Map(
    input.participants.map(p => [p.spaceEntityId, p.position ? 'supporting' : 'opposing'])
  );

  const documents = turns.map((turn, index) => ({
    id: String(index),
    content: turn.text.trim(),
    metadata: {
      speaker: turn.speakerName?.trim() || 'Unknown',
      side: sideBySpaceEntity.get(turn.speakerSpaceEntityId) ?? 'unknown',
    },
  }));

  try {
    const result = await runExtraction(config, {
      media_type: 'debate',
      documents,
      title: input.claimText.trim(),
      context: buildContext(input),
      grouping: false,
      classify_factuality: true,
    });
    return mapClaims(result, turns.length);
  } catch (error) {
    console.warn(`[debate-claims] extraction failed for debate ${input.debateId}; publishing without claims.`, error);
    return [];
  }
}

/** Map the raw extraction result to per-turn claims, dropping any with an out-of-range turn index. */
export function mapClaims(result: ClaimsExtractResult, turnCount: number): DebateClaimInput[] {
  const claims: DebateClaimInput[] = [];
  for (const claim of result.claims ?? []) {
    const text = claim.text?.trim();
    if (!text) continue;
    const turnIndex = claim.document_indices?.[0];
    if (typeof turnIndex !== 'number' || !Number.isInteger(turnIndex) || turnIndex < 0 || turnIndex >= turnCount) {
      continue;
    }
    claims.push({ text, isFactual: claim.is_factual ?? null, turnIndex });
  }
  return claims;
}

async function runExtraction(config: ExtractionConfig, payload: Record<string, unknown>): Promise<ClaimsExtractResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  const enqueue = await fetch(`${config.baseUrl}/tasks`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ type: EXTRACTION_TASK_TYPE, payload }),
    cache: 'no-store',
  });
  if (!enqueue.ok) throw new Error(`claims.extract enqueue failed (${enqueue.status})`);
  const enqueued = (await enqueue.json()) as { id?: string };
  if (!enqueued.id) throw new Error('claims.extract enqueue returned no task id');

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const response = await fetch(`${config.baseUrl}/tasks/${enqueued.id}`, { headers, cache: 'no-store' });
    if (!response.ok) throw new Error(`claims.extract poll failed (${response.status})`);
    const body = (await response.json()) as TaskStatusResponse;
    if (body.result) return body.result;
    if (body.error || (body.status && /fail|error|cancel/i.test(body.status))) {
      throw new Error(`claims.extract task ${enqueued.id} failed: ${body.error ?? body.status}`);
    }
  }
  throw new Error(`claims.extract task ${enqueued.id} timed out after ${POLL_TIMEOUT_MS}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
