import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { hasPendingClientToolCall, shouldResubmitAfterClientExecution } from './client-tools';

function toolPart(toolCallId: string, type: string, state: string) {
  return { type, toolCallId, state, input: {} } as unknown as UIMessage['parts'][number];
}

const stepStart = { type: 'step-start' } as unknown as UIMessage['parts'][number];

function assistant(parts: UIMessage['parts']): UIMessage {
  return { id: 'a1', role: 'assistant', parts };
}

const user: UIMessage = { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'create a page' }] };

describe('shouldResubmitAfterClientExecution', () => {
  // This shape is what a chat persisted mid-turn comes back as: the widget saves
  // on `status === 'ready'`, which includes the gap between resubmits, so the
  // trailing step's client tools are all settled. It reads as "a follow-up
  // request is due" — but after a reload nothing fires one, since the SDK only
  // evaluates this on its own transitions and not on a restoring `setMessages`.
  // That is why hydration marks a restored turn as stopped; if this expectation
  // ever flips, that flag has lost its reason to exist.
  it('is true for a settled turn — the shape a restored chat comes back as', () => {
    const messages = [user, assistant([stepStart, toolPart('call_1', 'tool-createEntity', 'output-available')])];

    expect(shouldResubmitAfterClientExecution({ messages })).toBe(true);
    // And nothing looks in-flight, so the panel has no other reason to settle.
    expect(hasPendingClientToolCall(messages)).toBe(false);
  });

  it('is false while a client tool is still running', () => {
    const messages = [user, assistant([stepStart, toolPart('call_1', 'tool-createEntity', 'input-available')])];

    expect(shouldResubmitAfterClientExecution({ messages })).toBe(false);
    expect(hasPendingClientToolCall(messages)).toBe(true);
  });

  it('is false once the unsettled part is scrubbed away', () => {
    // What restore actually hands over after `scrubUnsettledToolParts`: no tools
    // on the last step at all, so neither signal keeps the panel busy.
    const messages = [user, assistant([stepStart])];

    expect(shouldResubmitAfterClientExecution({ messages })).toBe(false);
    expect(hasPendingClientToolCall(messages)).toBe(false);
  });

  it('ignores a server-executed tool so follow-ups cannot loop', () => {
    const messages = [user, assistant([stepStart, toolPart('call_1', 'tool-suggestFollowUps', 'output-available')])];

    expect(shouldResubmitAfterClientExecution({ messages })).toBe(false);
  });

  it('treats geoQuery as client-executed like the other sub-agent tools', () => {
    // Omitting it from CLIENT_EXECUTED_TOOL_TYPES is silent and fatal: the
    // sub-agent answers, nothing resubmits, and the model never sees the result
    // — the turn just stops. Meanwhile `isBusy` reads false for the whole 30s
    // call, so the composer unlocks mid-turn.
    const running = [user, assistant([stepStart, toolPart('call_1', 'tool-geoQuery', 'input-available')])];
    expect(hasPendingClientToolCall(running)).toBe(true);
    expect(shouldResubmitAfterClientExecution({ messages: running })).toBe(false);

    const settled = [user, assistant([stepStart, toolPart('call_1', 'tool-geoQuery', 'output-available')])];
    expect(shouldResubmitAfterClientExecution({ messages: settled })).toBe(true);
  });

  it('treats both import tools as client-executed', () => {
    // Same failure mode that broke round 7: a client-dispatched tool missing
    // from CLIENT_EXECUTED_TOOL_TYPES never resubmits, so the model never sees
    // its result and the turn just stops — while `isBusy` reads false for the
    // whole run, unlocking the composer mid-import.
    for (const tool of ['tool-proposeImportMapping', 'tool-applyImport']) {
      const running = [user, assistant([stepStart, toolPart('call_1', tool, 'input-available')])];
      expect(hasPendingClientToolCall(running), tool).toBe(true);
      expect(shouldResubmitAfterClientExecution({ messages: running }), tool).toBe(false);

      const settled = [user, assistant([stepStart, toolPart('call_1', tool, 'output-available')])];
      expect(shouldResubmitAfterClientExecution({ messages: settled }), tool).toBe(true);
    }
  });

  it('only considers the last step', () => {
    const messages = [
      user,
      assistant([
        stepStart,
        toolPart('call_1', 'tool-searchGraph', 'output-available'),
        stepStart,
        toolPart('call_2', 'tool-createEntity', 'input-available'),
      ]),
    ];

    expect(shouldResubmitAfterClientExecution({ messages })).toBe(false);
  });
});
