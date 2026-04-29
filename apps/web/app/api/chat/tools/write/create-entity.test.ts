import { describe, expect, it } from 'vitest';

import type { WriteContext } from './context';
import { buildCreateEntityTool } from './create-entity';

function memberContext(overrides: Partial<WriteContext> = {}): WriteContext {
  return {
    kind: 'member',
    walletAddress: '0xabc',
    personalSpaceId: async () => null,
    isMember: async () => true,
    checkEditRateLimit: async () => ({ ok: true }),
    mintedBlockIds: new Set<string>(),
    ...overrides,
  } as WriteContext;
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

const SPACE = '11111111111111111111111111111111';
const TYPE_A = '22222222222222222222222222222222';
const TYPE_B = '33333333333333333333333333333333';

describe('createEntity', () => {
  it('mints a new entity id and forwards name + description + types', async () => {
    const tool = buildCreateEntityTool(memberContext());
    const output = (await runTool(tool, {
      spaceId: SPACE,
      name: 'Acme Corp',
      description: 'A fake company used in tests.',
      typeIds: [TYPE_A, TYPE_B],
    })) as {
      ok: true;
      intent: {
        kind: 'createEntity';
        entityId: string;
        spaceId: string;
        name: string;
        description?: string;
        typeIds?: string[];
      };
    };
    expect(output.ok).toBe(true);
    expect(output.intent.kind).toBe('createEntity');
    expect(output.intent.spaceId).toBe(SPACE);
    expect(output.intent.name).toBe('Acme Corp');
    expect(output.intent.description).toBe('A fake company used in tests.');
    expect(output.intent.typeIds).toEqual([TYPE_A, TYPE_B]);
    expect(output.intent.entityId).toMatch(/^[a-f0-9]{32}$/);
  });

  it('omits description and typeIds when not provided', async () => {
    const tool = buildCreateEntityTool(memberContext());
    const output = (await runTool(tool, { spaceId: SPACE, name: 'Minimal' })) as {
      ok: true;
      intent: Record<string, unknown>;
    };
    expect(output.ok).toBe(true);
    expect(output.intent).not.toHaveProperty('description');
    expect(output.intent).not.toHaveProperty('typeIds');
  });

  it('trims whitespace from name and description', async () => {
    const tool = buildCreateEntityTool(memberContext());
    const output = (await runTool(tool, {
      spaceId: SPACE,
      name: '  Spaced Out  ',
      description: '  Trimmed.  ',
    })) as { ok: true; intent: { name: string; description?: string } };
    expect(output.intent.name).toBe('Spaced Out');
    expect(output.intent.description).toBe('Trimmed.');
  });

  it('strips trailing periods from the name', async () => {
    const tool = buildCreateEntityTool(memberContext());
    const output = (await runTool(tool, { spaceId: SPACE, name: 'Acme Corp.' })) as {
      ok: true;
      intent: { name: string };
    };
    expect(output.intent.name).toBe('Acme Corp');
  });

  it('appends a period to a description that lacks one', async () => {
    const tool = buildCreateEntityTool(memberContext());
    const output = (await runTool(tool, {
      spaceId: SPACE,
      name: 'x',
      description: 'No terminal punctuation',
    })) as { ok: true; intent: { description?: string } };
    expect(output.intent.description).toBe('No terminal punctuation.');
  });

  it('preserves existing terminal punctuation on descriptions', async () => {
    const tool = buildCreateEntityTool(memberContext());
    const output = (await runTool(tool, {
      spaceId: SPACE,
      name: 'x',
      description: 'Why does this exist?',
    })) as { ok: true; intent: { description?: string } };
    expect(output.intent.description).toBe('Why does this exist?');
  });

  it('rejects an empty name', async () => {
    const tool = buildCreateEntityTool(memberContext());
    const output = await runTool(tool, { spaceId: SPACE, name: '   ' });
    expect(output).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('rejects invalid type ids', async () => {
    const tool = buildCreateEntityTool(memberContext());
    const output = await runTool(tool, { spaceId: SPACE, name: 'x', typeIds: ['not-valid'] });
    expect(output).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('rejects non-members with not_authorized', async () => {
    const tool = buildCreateEntityTool(memberContext({ isMember: async () => false }));
    const output = await runTool(tool, { spaceId: SPACE, name: 'x' });
    expect(output).toEqual({ ok: false, error: 'not_authorized', spaceId: SPACE });
  });

  it('rejects guests with not_signed_in', async () => {
    const tool = buildCreateEntityTool(guestContext());
    const output = await runTool(tool, { spaceId: SPACE, name: 'x' });
    expect(output).toEqual({ ok: false, error: 'not_signed_in' });
  });
});
