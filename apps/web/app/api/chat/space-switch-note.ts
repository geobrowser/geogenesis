import type { ModelMessage, UIMessage } from 'ai';

/**
 * Tell the model, inside the turn itself, that earlier messages were sent from
 * a different space.
 *
 * Navigating between spaces mid-conversation produced answers about the space
 * the user had left, two different ways. It answered "how many projects are in
 * this space?" from an earlier reply without calling any tool at all; and for
 * "what's in this space?" it called `geoQuery` three times and put the
 * *previous* space's id in every query. Checked against the graph, both answers
 * were the old space's numbers.
 *
 * The second is why this note exists, and why it is not one more line in the
 * system prompt. `Current space id` was already there — correct, and re-rendered
 * on every request — throughout both failures. What the model copies from is its
 * own previous tool calls, which carry the literal text `in space "<old id>"`:
 * exactly the shape it is about to write again. A correction has to sit beside
 * the question being answered, not 28k characters above it.
 *
 * Nothing is removed from the conversation, so ids the user may still need — a
 * cross-space move, "add the first one to this space" — stay reachable.
 */

function normalizeSpaceId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/-/g, '').toLowerCase();
  return /^[a-f0-9]{32}$/.test(normalized) ? normalized : null;
}

/**
 * The space the conversation has moved on from, or null when it hasn't.
 *
 * Asks "does the history hold another space", not "did the space change this
 * turn". A change-only trigger goes silent on the very next turn while the old
 * space's tool calls are still in context — so the second question after
 * navigating would quietly revert to the old id.
 */
export function previousSpaceInConversation(
  messages: ReadonlyArray<UIMessage>,
  currentSpaceId: string | null
): string | null {
  const current = normalizeSpaceId(currentSpaceId);
  if (!current) return null;

  // Most recent first: after two moves, the space just left is the one whose
  // results are freshest in context and likeliest to be copied.
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== 'user') continue;
    const stamped = normalizeSpaceId((message.metadata as { spaceId?: unknown } | undefined)?.spaceId);
    if (stamped && stamped !== current) return stamped;
  }

  return null;
}

/**
 * Where the user is standing, restated beside the question on every turn.
 *
 * `renderSpaceSwitchNote` covers the case where the *user* moved. It cannot
 * cover the case where *we* moved them: `navigate` and `joinSpace` put another
 * space's id all over the transcript, and the assistant's own reply — "I've
 * navigated you to the Health space. You're now viewing it." — is a first-person
 * claim about the present that outlives the navigation. The user walking back to
 * their own space leaves no trace at all, because every message they typed was
 * stamped with the same space the whole time, so the switch note stays silent.
 *
 * Measured, not assumed: replaying the reported session, the executor put the
 * navigated-to space id in `createBlock` on 2 of 2 runs, and still did on 2 of 2
 * runs with the switch note injected — the note argues about "earlier messages"
 * while the model is reading its own statement about now. Naming the current
 * space and explicitly retiring that statement held on 5 of 5. A shorter form
 * that named the space without retracting the claim held on only 2 of 3.
 *
 * Always-on deliberately: the failure came from a trigger condition that didn't
 * fire, and a note with no trigger cannot have a gap. It does not stop the model
 * acting on another space the user names — "what types does the Crypto space
 * have?" and "move Acme Corp to the Crypto space" both still target Crypto.
 */
export function renderCurrentSpaceNote(currentSpaceId: string): string {
  return (
    `[Context] The user is on the page for space \`${currentSpaceId}\` right now. If you navigated them somewhere ` +
    `else earlier in this conversation, they are no longer there — disregard any earlier statement of yours about ` +
    `which space they are viewing. "this space", "here" and "this page" mean \`${currentSpaceId}\`, and every write ` +
    `this turn targets \`${currentSpaceId}\` unless the user names a different space in the message above.`
  );
}

export function renderSpaceSwitchNote(currentSpaceId: string, previousSpaceId: string): string {
  return (
    `[Space context] The user is now in space \`${currentSpaceId}\`. Earlier messages in this conversation were ` +
    `sent from space \`${previousSpaceId}\`, so the counts, lists and ids above describe that other space. Do not ` +
    `reuse those numbers, and do not copy \`${previousSpaceId}\` into a new tool call. "this space", "here" and ` +
    `"this page" mean \`${currentSpaceId}\` — look it up again rather than answering from what is already above.`
  );
}

/**
 * Append the note to the last user message.
 *
 * The last user message rather than the system prompt because that is where the
 * model is looking when it decides whether to call a tool and which id to put
 * in it. Appended rather than prepended so the user's own words still open the
 * message.
 */
export function appendNoteToLastUserMessage(messages: ModelMessage[], note: string): ModelMessage[] {
  let index = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      index = i;
      break;
    }
  }
  if (index === -1) return messages;

  const target = messages[index];
  // Re-narrows to the user message shape; `ModelMessage['content']` is the
  // union across every role, which a tool result would satisfy too.
  if (target.role !== 'user') return messages;

  const content = target.content;
  let nextContent: typeof content;
  if (typeof content === 'string') {
    nextContent = `${content}\n\n${note}`;
  } else if (Array.isArray(content)) {
    nextContent = [...content, { type: 'text' as const, text: `\n\n${note}` }];
  } else {
    return messages;
  }

  const next = [...messages];
  next[index] = { ...target, content: nextContent };
  return next;
}
