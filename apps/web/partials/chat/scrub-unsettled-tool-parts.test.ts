import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { scrubUnsettledToolParts } from './scrub-unsettled-tool-parts';

function toolPart(toolCallId: string, state: string) {
  return { type: 'tool-setEntityValue', toolCallId, state, input: {} } as unknown as UIMessage['parts'][number];
}

function assistant(parts: UIMessage['parts']): UIMessage {
  return { id: 'a1', role: 'assistant', parts };
}

const text = { type: 'text', text: 'Added the property.' } as unknown as UIMessage['parts'][number];

describe('scrubUnsettledToolParts', () => {
  it('drops a write that never settled', () => {
    // The edit dispatcher executes any write part still in `input-available`,
    // and its dedup set is per-mount — so restoring one after a reload would
    // stage the same edit a second time.
    const [message] = scrubUnsettledToolParts([assistant([text, toolPart('call_pending', 'input-available')])]);

    expect(message.parts).toEqual([text]);
  });

  it('drops a part still streaming its arguments', () => {
    const [message] = scrubUnsettledToolParts([assistant([toolPart('call_streaming', 'input-streaming')])]);

    expect(message.parts).toEqual([]);
  });

  it('keeps completed and errored calls', () => {
    // These are finished history: the record of what the turn actually did.
    const parts = [toolPart('call_done', 'output-available'), toolPart('call_failed', 'output-error')];
    const [message] = scrubUnsettledToolParts([assistant(parts)]);

    expect(message.parts).toEqual(parts);
  });

  it('leaves a clean message identical, not a copy', () => {
    // The restore path feeds this straight into setMessages; re-identifying
    // untouched messages would churn every downstream effect on mount.
    const message = assistant([text, toolPart('call_done', 'output-available')]);
    const [scrubbed] = scrubUnsettledToolParts([message]);

    expect(scrubbed).toBe(message);
  });

  it('never touches user messages', () => {
    const user: UIMessage = { id: 'u1', role: 'user', parts: [text] };

    expect(scrubUnsettledToolParts([user])[0]).toBe(user);
  });

  it('scrubs every assistant message, not just the last', () => {
    const scrubbed = scrubUnsettledToolParts([
      assistant([toolPart('call_old', 'input-available')]),
      { id: 'u1', role: 'user', parts: [text] },
      assistant([toolPart('call_new', 'input-available')]),
    ]);

    expect(scrubbed.flatMap(m => m.parts)).toEqual([text]);
  });
});
