// POST /api/chat/authorize-write
//
// Auth gate the client-side write dispatcher hits before applying any write
// intent: guest rejection, membership check, per-wallet edit rate limit.
// `toggleEditMode` skips the rate limit because it's a UI-only mutation.
//
// Graph-state validation (does the property/entity exist? what's its dataType?
// is the relation already there?) lives in core/chat/write-validators.ts —
// running it client-side is what lets locally-minted properties/entities/blocks
// be addressable from the assistant.
import { cookies } from 'next/headers';

import { EDIT_TOOL_NAMES, type EditToolFailure, notAuthorized, notSignedIn, rateLimited } from '~/core/chat/edit-types';
import { WALLET_ADDRESS } from '~/core/cookie';

import { buildWriteContext } from '../tools/write/context';

const ENTITY_ID_RE = /^[a-f0-9]{32}$|^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const WRITE_TOOL_NAMES = new Set<string>(EDIT_TOOL_NAMES);

type AuthorizeOutput = { ok: true } | EditToolFailure;

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

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(req: Request): Promise<Response> {
  if (!isSameOrigin(req)) return jsonResponse(403, { ok: false, error: 'forbidden' });

  let body: { spaceId?: unknown; toolName?: unknown; targetSpaceId?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { ok: false, error: 'invalid_input' });
  }
  const { spaceId, toolName, targetSpaceId } = body;
  if (typeof toolName !== 'string' || !WRITE_TOOL_NAMES.has(toolName)) {
    return jsonResponse(400, { ok: false, error: 'invalid_input', message: 'unknown toolName' });
  }
  // toggleEditMode is space-agnostic — the only write tool that takes no
  // spaceId. Every other tool must pass a valid space id.
  if (toolName !== 'toggleEditMode') {
    if (typeof spaceId !== 'string' || !ENTITY_ID_RE.test(spaceId)) {
      return jsonResponse(400, { ok: false, error: 'invalid_input', message: 'spaceId is required' });
    }
  }
  // Cross-space tools require membership in the target too — checked below.
  const isCrossSpaceTool = toolName === 'moveEntityToSpace' || toolName === 'cloneEntityToSpace';
  if (isCrossSpaceTool) {
    if (typeof targetSpaceId !== 'string' || !ENTITY_ID_RE.test(targetSpaceId)) {
      return jsonResponse(400, { ok: false, error: 'invalid_input', message: 'targetSpaceId is required' });
    }
  }

  const cookieStore = await cookies();
  const wallet = parseWalletCookie(cookieStore.get(WALLET_ADDRESS)?.value);
  const context = buildWriteContext({ walletAddress: wallet });

  if (context.kind !== 'member') {
    return jsonResponse(200, notSignedIn() satisfies AuthorizeOutput);
  }

  if (toolName !== 'toggleEditMode') {
    const normalizedSpaceId = (spaceId as string).replace(/-/g, '').toLowerCase();
    const isMember = await context.isMember(normalizedSpaceId);
    if (!isMember) return jsonResponse(200, notAuthorized(normalizedSpaceId) satisfies AuthorizeOutput);
    if (isCrossSpaceTool) {
      const normalizedTargetSpaceId = (targetSpaceId as string).replace(/-/g, '').toLowerCase();
      // Same-space "move" is a no-op; reject up front rather than letting it
      // through as a non-mutation that the user can't easily explain.
      if (normalizedTargetSpaceId === normalizedSpaceId) {
        return jsonResponse(200, {
          ok: false,
          error: 'invalid_input',
          message: 'targetSpaceId must differ from sourceSpaceId',
        } satisfies AuthorizeOutput);
      }
      const isTargetMember = await context.isMember(normalizedTargetSpaceId);
      if (!isTargetMember) {
        return jsonResponse(200, notAuthorized(normalizedTargetSpaceId) satisfies AuthorizeOutput);
      }
    }
  }

  if (toolName === 'toggleEditMode') {
    // UI toggle bypasses the edit rate-limit axis (matches the carve-out
    // previously inside tools/write/toggle-edit-mode.ts).
    return jsonResponse(200, { ok: true } satisfies AuthorizeOutput);
  }

  const limit = await context.checkEditRateLimit();
  if (!limit.ok) return jsonResponse(200, rateLimited(limit.retryAfter) satisfies AuthorizeOutput);

  return jsonResponse(200, { ok: true } satisfies AuthorizeOutput);
}
