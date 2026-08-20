import type { UIMessage } from 'ai';
import { describe, expect, it, vi } from 'vitest';

// The route pulls in the Anthropic client and the Upstash limiters at import
// time; neither matters for validation.
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: () => () => ({}) }));
vi.mock('../rate-limit', () => ({ anonLimit: {}, ipCeilingLimit: {}, loggedInLimit: {} }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));

const { validateUIMessages } = await import('./route');

function message(n: number): UIMessage {
  return { id: `m${n}`, role: n % 2 === 0 ? 'user' : 'assistant', parts: [{ type: 'text', text: `msg ${n}` }] };
}

function conversation(length: number): UIMessage[] {
  return Array.from({ length }, (_, i) => message(i));
}

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
