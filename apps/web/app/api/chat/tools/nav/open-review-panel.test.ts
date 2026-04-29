import { describe, expect, it } from 'vitest';

import type { WriteContext } from '../write/context';
import { buildOpenReviewPanelTool } from './open-review-panel';

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

async function runTool(tool: { execute?: (input: unknown, opts: unknown) => Promise<unknown> }, input: unknown) {
  if (!tool.execute) throw new Error('tool.execute missing');
  return tool.execute(input, {} as unknown);
}

describe('openReviewPanel', () => {
  it('returns { ok: true } for a member', async () => {
    const tool = buildOpenReviewPanelTool(memberContext());
    const output = await runTool(tool, {});
    expect(output).toEqual({ ok: true });
  });

  it('rejects guests with not_signed_in', async () => {
    // Guests shouldn't have the tool registered in the first place (see
    // buildNavTools in ./index.ts), but if they somehow call it the execute
    // path still refuses cleanly.
    const tool = buildOpenReviewPanelTool(guestContext());
    const output = await runTool(tool, {});
    expect(output).toEqual({ ok: false, error: 'not_signed_in' });
  });
});
