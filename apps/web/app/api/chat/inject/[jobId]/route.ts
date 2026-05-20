// GET /api/chat/inject/[jobId] — proxies one poll to the external inject
// pipeline. When the job is complete, decodes the embedded GRC-20 v2 Edit
// server-side and returns the ops as JSON-safe objects (Uint8Array ids → hex,
// bigints → strings). The API key never leaves the server.
import { type Edit, decodeEdit } from '@geoprotocol/grc-20';

import { cookies } from 'next/headers';

import type {
  InjectPollResponse,
  SerializedOp,
  SerializedPropertyValue,
  SerializedUnsetLanguage,
  SerializedUnsetValue,
  SerializedValue,
} from '~/core/chat/inject-types';
import { WALLET_ADDRESS } from '~/core/cookie';

import { ipCeilingLimit, loggedInLimit } from '../../rate-limit';

const INJECT_FETCH_TIMEOUT_MS = 15_000;

function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (!origin) return process.env.NODE_ENV !== 'production';
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function parseWalletCookie(raw: string | undefined): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(lower) ? lower : null;
}

function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  return `noip:${crypto.randomUUID()}`;
}

function jsonError(status: number, message: string, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function rateLimitResponse(reset: number) {
  const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  return jsonError(429, 'Rate limit exceeded.', { 'Retry-After': retryAfter.toString() });
}

function jsonOk(body: InjectPollResponse) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function injectBase(): string | null {
  const raw = process.env.INJECT_BASE?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, '');
}

async function getFromInject(path: string, apiKey: string) {
  const base = injectBase();
  if (!base) throw new Error('INJECT_BASE not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INJECT_FETCH_TIMEOUT_MS);
  try {
    return await fetch(`${base}${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// Lowercase 32-char hex string with no dashes. Matches geogenesis' canonical
// id format throughout the local store and the geo-sdk lite `Op` type.
function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

function serializeUnsetLanguage(lang: { type: string; language?: Uint8Array }): SerializedUnsetLanguage {
  if (lang.type === 'specific' && lang.language) {
    return { type: 'specific', language: bytesToHex(lang.language) };
  }
  if (lang.type === 'english') return { type: 'english' };
  return { type: 'all' };
}

// Walks the discriminated Value union from grc-20 and returns the JSON-safe shape.
// Decimal mantissa.bigint becomes a string; bytes/embedding payloads become hex.
function serializeValue(v: unknown): SerializedValue {
  const value = v as { type: string; [k: string]: unknown };
  switch (value.type) {
    case 'boolean':
      return { type: 'boolean', value: value.value as boolean };
    case 'integer':
      return {
        type: 'integer',
        value: (value.value as bigint).toString(),
        ...(value.unit ? { unit: bytesToHex(value.unit as Uint8Array) } : {}),
      };
    case 'float':
      return {
        type: 'float',
        value: value.value as number,
        ...(value.unit ? { unit: bytesToHex(value.unit as Uint8Array) } : {}),
      };
    case 'decimal': {
      const m = value.mantissa as { type: 'i64'; value: bigint } | { type: 'big'; bytes: Uint8Array };
      const mantissa =
        m.type === 'i64'
          ? { type: 'i64' as const, value: m.value.toString() }
          : { type: 'big' as const, bytes: bytesToHex(m.bytes) };
      return {
        type: 'decimal',
        exponent: value.exponent as number,
        mantissa,
        ...(value.unit ? { unit: bytesToHex(value.unit as Uint8Array) } : {}),
      };
    }
    case 'text':
      return {
        type: 'text',
        value: value.value as string,
        ...(value.language ? { language: bytesToHex(value.language as Uint8Array) } : {}),
      };
    case 'bytes':
      return { type: 'bytes', value: bytesToHex(value.value as Uint8Array) };
    case 'date':
      return { type: 'date', value: value.value as string };
    case 'time':
      return { type: 'time', value: value.value as string };
    case 'datetime':
      return { type: 'datetime', value: value.value as string };
    case 'schedule':
      return { type: 'schedule', value: value.value as string };
    case 'point':
      return {
        type: 'point',
        lat: value.lat as number,
        lon: value.lon as number,
        ...(value.alt !== undefined ? { alt: value.alt as number } : {}),
      };
    case 'rect':
      return {
        type: 'rect',
        minLat: value.minLat as number,
        minLon: value.minLon as number,
        maxLat: value.maxLat as number,
        maxLon: value.maxLon as number,
      };
    case 'embedding':
      return {
        type: 'embedding',
        subType: value.subType as number,
        dims: value.dims as number,
        data: bytesToHex(value.data as Uint8Array),
      };
    default:
      throw new Error(`Unknown value type: ${String(value.type)}`);
  }
}

function serializePropertyValue(pv: { property: Uint8Array; value: unknown }): SerializedPropertyValue {
  return { property: bytesToHex(pv.property), value: serializeValue(pv.value) };
}

function serializeUnsetValue(u: {
  property: Uint8Array;
  language: { type: string; language?: Uint8Array };
}): SerializedUnsetValue {
  return { property: bytesToHex(u.property), language: serializeUnsetLanguage(u.language) };
}

function serializeOps(ops: Edit['ops']): SerializedOp[] {
  return ops.map((op): SerializedOp => {
    switch (op.type) {
      case 'createEntity':
        return { type: 'createEntity', id: bytesToHex(op.id), values: op.values.map(serializePropertyValue) };
      case 'updateEntity':
        return {
          type: 'updateEntity',
          id: bytesToHex(op.id),
          set: op.set.map(serializePropertyValue),
          unset: op.unset.map(serializeUnsetValue),
        };
      case 'deleteEntity':
        return { type: 'deleteEntity', id: bytesToHex(op.id) };
      case 'restoreEntity':
        return { type: 'restoreEntity', id: bytesToHex(op.id) };
      case 'createRelation':
        return {
          type: 'createRelation',
          id: bytesToHex(op.id),
          relationType: bytesToHex(op.relationType),
          from: bytesToHex(op.from),
          to: bytesToHex(op.to),
          ...(op.fromIsValueRef !== undefined ? { fromIsValueRef: op.fromIsValueRef } : {}),
          ...(op.toIsValueRef !== undefined ? { toIsValueRef: op.toIsValueRef } : {}),
          ...(op.fromSpace ? { fromSpace: bytesToHex(op.fromSpace) } : {}),
          ...(op.fromVersion ? { fromVersion: bytesToHex(op.fromVersion) } : {}),
          ...(op.toSpace ? { toSpace: bytesToHex(op.toSpace) } : {}),
          ...(op.toVersion ? { toVersion: bytesToHex(op.toVersion) } : {}),
          ...(op.entity ? { entity: bytesToHex(op.entity) } : {}),
          ...(op.position ? { position: op.position } : {}),
        };
      case 'updateRelation':
        return {
          type: 'updateRelation',
          id: bytesToHex(op.id),
          ...(op.fromSpace ? { fromSpace: bytesToHex(op.fromSpace) } : {}),
          ...(op.fromVersion ? { fromVersion: bytesToHex(op.fromVersion) } : {}),
          ...(op.toSpace ? { toSpace: bytesToHex(op.toSpace) } : {}),
          ...(op.toVersion ? { toVersion: bytesToHex(op.toVersion) } : {}),
          ...(op.position ? { position: op.position } : {}),
          unset: op.unset,
        };
      case 'deleteRelation':
        return { type: 'deleteRelation', id: bytesToHex(op.id) };
      case 'restoreRelation':
        return { type: 'restoreRelation', id: bytesToHex(op.id) };
      case 'createValueRef':
        return {
          type: 'createValueRef',
          id: bytesToHex(op.id),
          entity: bytesToHex(op.entity),
          property: bytesToHex(op.property),
          ...(op.language ? { language: bytesToHex(op.language) } : {}),
          ...(op.space ? { space: bytesToHex(op.space) } : {}),
        };
    }
  });
}

type InjectEditEnvelope = {
  encoding?: string;
  editId?: string;
  name?: string;
  opCount?: number;
  data?: string;
};

type InjectPollBody = {
  status?: string;
  story?: { edit?: InjectEditEnvelope | null } | null;
  posts?: Array<{ edit?: InjectEditEnvelope | null } | null> | null;
  errors?: unknown;
};

function extractEditEnvelope(body: InjectPollBody): InjectEditEnvelope | null {
  if (body.story?.edit) return body.story.edit;
  const firstPost = body.posts?.[0];
  if (firstPost && firstPost.edit) return firstPost.edit;
  return null;
}

export async function GET(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  if (!isSameOrigin(req)) {
    return jsonError(403, 'Forbidden');
  }

  const cookieStore = await cookies();
  const wallet = parseWalletCookie(cookieStore.get(WALLET_ADDRESS)?.value);
  if (!wallet) {
    return jsonError(401, 'Sign in to use inject.');
  }

  const ip = getClientIp(req);
  try {
    const [identity, ipCeiling] = await Promise.all([loggedInLimit.limit(wallet), ipCeilingLimit.limit(ip)]);
    if (!identity.success || !ipCeiling.success) {
      const reset = Math.max(identity.success ? 0 : identity.reset, ipCeiling.success ? 0 : ipCeiling.reset);
      return rateLimitResponse(reset);
    }
  } catch (err) {
    console.error('[chat/inject/poll] rate limiter unavailable; failing closed', err);
    return jsonError(503, 'Service temporarily unavailable.');
  }

  const { jobId } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId)) {
    return jsonError(400, 'Invalid jobId');
  }

  const apiKey = process.env.INJECT_API_KEY?.trim();
  if (!apiKey || !injectBase()) {
    console.error('[chat/inject/poll] INJECT_BASE / INJECT_API_KEY not configured');
    return jsonError(503, 'Inject service not configured.');
  }

  let res: Response;
  try {
    res = await getFromInject(`/inject/${encodeURIComponent(jobId)}`, apiKey);
    if (res.status === 404) {
      console.log('[chat/inject/poll] /inject/:jobId 404, falling back to /admin/inject/:jobId');
      res = await getFromInject(`/admin/inject/${encodeURIComponent(jobId)}`, apiKey);
    }
  } catch (err) {
    console.error('[chat/inject/poll] proxy fetch failed', err);
    if (err instanceof Error && err.name === 'AbortError') {
      return jsonError(504, 'Inject service timed out.');
    }
    return jsonError(502, 'Inject service unreachable.');
  }

  if (res.status === 404) {
    return jsonError(404, 'Job not found');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[chat/inject/poll] non-OK', res.status, text);
    return jsonError(502, `Inject service returned ${res.status}.`);
  }

  let body: InjectPollBody;
  try {
    body = (await res.json()) as InjectPollBody;
  } catch {
    return jsonError(502, 'Inject service returned non-JSON.');
  }

  const status = typeof body.status === 'string' ? body.status : 'pending';

  if (status === 'failed') {
    const errs = Array.isArray(body.errors) && body.errors.length > 0 ? String(body.errors[0]) : undefined;
    return jsonOk({ status: 'failed', error: errs });
  }

  if (status !== 'completed') {
    return jsonOk({ status: 'pending' });
  }

  const envelope = extractEditEnvelope(body);
  if (!envelope || !envelope.data) {
    // Stage `completed` with no edit means prepare-ops hasn't finished or failed silently.
    return jsonOk({ status: 'failed', error: 'No edit data in completed job.' });
  }

  if (envelope.encoding && envelope.encoding !== 'grc20-edit-v2-base64') {
    console.error('[chat/inject/poll] unexpected encoding', envelope.encoding);
    return jsonOk({ status: 'failed', error: `Unsupported edit encoding: ${envelope.encoding}` });
  }

  let decoded: Edit;
  try {
    const bytes = Uint8Array.from(Buffer.from(envelope.data, 'base64'));
    decoded = decodeEdit(bytes);
  } catch (err) {
    console.error('[chat/inject/poll] decodeEdit failed', err);
    return jsonOk({ status: 'failed', error: 'Failed to decode edit.' });
  }

  let ops: SerializedOp[];
  try {
    ops = serializeOps(decoded.ops);
  } catch (err) {
    console.error('[chat/inject/poll] serializeOps failed', err);
    return jsonOk({ status: 'failed', error: 'Failed to serialize ops.' });
  }

  if (Array.isArray(body.errors) && body.errors.length > 0) {
    console.warn('[chat/inject/poll] completed with errors', body.errors);
  }

  return jsonOk({ status: 'completed', name: decoded.name ?? envelope.name ?? '', ops });
}
