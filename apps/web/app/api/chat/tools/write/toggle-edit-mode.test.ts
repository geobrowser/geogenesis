import { describe, expect, it } from 'vitest';

import type { WriteContext } from './context';
import { buildToggleEditModeTool } from './toggle-edit-mode';

function memberContext(): WriteContext {
  return {
    kind: 'member',
    walletAddress: '0xabc',
    personalSpaceId: async () => null,
    isMember: async () => true,
    checkEditRateLimit: async () => ({ ok: true }),
    mintedBlockIds: new Set<string>(),
  };
}

function guestContext(): WriteContext {
  return {
    kind: 'guest',
    walletAddress: null,
    personalSpaceId: null,
    isMember: async () => false,
    checkEditRateLimit: async () => ({ ok: true }),
    mintedBlockIds: new Set<string>(),
  };
}

async function runTool<T>(tool: { execute?: (input: T, opts: unknown) => Promise<unknown> }, input: T) {
  if (!tool.execute) throw new Error('tool.execute missing');
  return tool.execute(input, {} as unknown);
}

describe('toggleEditMode', () => {
  it('returns a toggleEditMode intent for a member', async () => {
    const tool = buildToggleEditModeTool(memberContext());
    const output = await runTool(tool, { mode: 'edit' });
    expect(output).toEqual({ ok: true, intent: { kind: 'toggleEditMode', mode: 'edit' } });
  });

  it('returns browse mode too', async () => {
    const tool = buildToggleEditModeTool(memberContext());
    const output = await runTool(tool, { mode: 'browse' });
    expect(output).toEqual({ ok: true, intent: { kind: 'toggleEditMode', mode: 'browse' } });
  });

  it('rejects guest callers with not_signed_in', async () => {
    const tool = buildToggleEditModeTool(guestContext());
    const output = await runTool(tool, { mode: 'edit' });
    expect(output).toEqual({ ok: false, error: 'not_signed_in' });
  });

  // toggleEditMode deliberately bypasses the edit rate limiter: it's a
  // UI-only state change and shouldn't burn a quota slot. We assert that by
  // wiring a context whose checkEditRateLimit would refuse — and confirming
  // the tool succeeds anyway.
  it('does not consume the edit rate limit', async () => {
    let rateLimitChecked = false;
    const tool = buildToggleEditModeTool({
      kind: 'member',
      walletAddress: '0xabc',
      personalSpaceId: async () => null,
      isMember: async () => true,
      checkEditRateLimit: async () => {
        rateLimitChecked = true;
        return { ok: false, retryAfter: 42 };
      },
      mintedBlockIds: new Set<string>(),
    });
    const output = await runTool(tool, { mode: 'edit' });
    expect(output).toEqual({ ok: true, intent: { kind: 'toggleEditMode', mode: 'edit' } });
    expect(rateLimitChecked).toBe(false);
  });
});
