import type { UIMessage } from 'ai';
import { describe, expect, it, vi } from 'vitest';

// The route pulls in the Anthropic client and the Upstash limiters at import
// time; neither matters for validation.
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: () => () => ({}) }));
vi.mock('../rate-limit', () => ({ anonLimit: {}, ipCeilingLimit: {}, loggedInLimit: {} }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));

const { formatTranscript, validateUIMessages } = await import('./route');

function message(n: number): UIMessage {
  return { id: `m${n}`, role: n % 2 === 0 ? 'user' : 'assistant', parts: [{ type: 'text', text: `msg ${n}` }] };
}

function conversation(length: number): UIMessage[] {
  return Array.from({ length }, (_, i) => message(i));
}

describe('compaction evidence', () => {
  it('distinguishes previews, failed tools, and staged imports without sending full row data', () => {
    const transcript = formatTranscript([
      {
        id: 'outcomes',
        role: 'assistant',
        parts: [
          {
            type: 'tool-proposeImportMapping',
            toolCallId: 'preview',
            state: 'output-available',
            input: {},
            output: { status: 'preview', canApply: true, requiresConfirmation: true },
          },
          {
            type: 'tool-applyImport',
            toolCallId: 'denied',
            state: 'output-available',
            input: {},
            output: { error: 'not_authorized' },
          },
          {
            type: 'tool-applyImport',
            toolCallId: 'failed',
            state: 'output-error',
            input: {},
            errorText: 'Network unavailable',
          },
          {
            type: 'tool-applyImport',
            toolCallId: 'staged',
            state: 'output-available',
            input: {},
            output: { staged: true, entityCount: 2, rows: ['Do not copy these rows'] },
          },
          { type: 'tool-applyImport', toolCallId: 'pending', state: 'input-available', input: {} },
        ],
      },
    ]);
    expect(transcript).toContain('"status":"preview"');
    expect(transcript).toContain('"requiresConfirmation":true');
    expect(transcript).toContain('"error":"not_authorized"');
    expect(transcript).toContain('output-error');
    expect(transcript).toContain('Network unavailable');
    expect(transcript).toContain('"staged":true');
    expect(transcript).toContain('"entityCount":2');
    expect(transcript).toContain('[applyImport: input-available]');
    expect(transcript).not.toContain('Do not copy these rows');
  });
});

describe('validateUIMessages', () => {
  // The whole point of the endpoint is long conversations. Refusing them meant
  // the one case it exists for always failed — and the client re-fires on an
  // unchanged reading, so that refusal was permanent and looped.
  it('accepts a conversation far past the summarize window', () => {
    expect(validateUIMessages(conversation(500))).not.toBeNull();
  });

  it('keeps the most recent messages, not the oldest', () => {
    const trimmed = validateUIMessages(conversation(100));

    expect(trimmed).toHaveLength(60);
    expect(trimmed?.[0].id).toBe('m40');
    expect(trimmed?.at(-1)?.id).toBe('m99');
  });

  it('leaves a short conversation untouched', () => {
    const short = conversation(4);
    expect(validateUIMessages(short)).toEqual(short);
  });

  it('rejects a payload too large to be a real conversation', () => {
    expect(validateUIMessages(conversation(2_001))).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(validateUIMessages(null)).toBeNull();
    expect(validateUIMessages([])).toBeNull();
    expect(validateUIMessages('nope')).toBeNull();
    expect(validateUIMessages([{ role: 'system', parts: [] }])).toBeNull();
    expect(validateUIMessages([{ role: 'user' }])).toBeNull();
    expect(validateUIMessages([{ role: 'user', parts: [{ noType: true }] }])).toBeNull();
  });

  it('validates every message, including ones that will be trimmed away', () => {
    // Trimming happens after the walk, so a bad message outside the window is
    // still a bad payload — never silently dropped.
    const messages = [{ role: 'system', parts: [] }, ...conversation(80)];

    expect(validateUIMessages(messages)).toBeNull();
  });
});
