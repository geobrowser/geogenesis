// POST /api/chat/authorize-write — auth gate before the client dispatcher
// applies a write intent. Graph-state validation lives client-side in
// core/chat/write-validators.ts so locally-minted entities are addressable.
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
  // toggleEditMode is the only space-agnostic write tool.
  if (toolName !== 'toggleEditMode') {
    if (typeof spaceId !== 'string' || !ENTITY_ID_RE.test(spaceId)) {
      return jsonResponse(400, { ok: false, error: 'invalid_input', message: 'spaceId is required' });
    }
  }
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
      // Same-space "move" is a no-op — reject up front.
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

  // Rate-limit every write tool, including toggleEditMode (otherwise the UI
  // toggle becomes a free heartbeat for any wallet-shaped cookie).
  const limit = await context.checkEditRateLimit();
  if (!limit.ok) return jsonResponse(200, rateLimited(limit.retryAfter) satisfies AuthorizeOutput);

  return jsonResponse(200, { ok: true } satisfies AuthorizeOutput);
}
