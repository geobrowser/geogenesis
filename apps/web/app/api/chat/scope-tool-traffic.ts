import type { ModelMessage } from 'ai';

/**
 * Narrow the closer's view of the past to prose, keeping every tool call and
 * result from the current turn.
 *
 * The closer is told to answer from *this turn's* tool results, but it receives
 * the whole conversation — and a result from two turns ago is shaped exactly
 * like one that just arrived. That is how "what news stories are in this space?"
 * came back answered about a podcast the user had asked about earlier, from a
 * different space: the stale result was still in view, indistinguishable from
 * the fresh ones.
 *
 * Earlier exchanges keep their text, since the closer still needs them to
 * resolve "it" / "that one". Only their tool traffic goes. The boundary is the
 * last user message — the same one `classifyTurn` uses — because a resubmit
 * chain leaves most of the current turn's tool calls in the converted history
 * rather than in `execMessages`, so a naive "strip the history" would blind the
 * closer to the very results it has to summarise.
 *
 * Calls and results drop together so neither half of a pair is ever orphaned
 * (Anthropic rejects a `tool_result` with no matching `tool_use`), and an
 * assistant message that carried nothing else drops with them.
 */
export function scopeToolTrafficToCurrentTurn(allMessages: ModelMessage[]): ModelMessage[] {
  let lastUserIdx = -1;
  for (let i = allMessages.length - 1; i >= 0; i--) {
    if (allMessages[i].role === 'user') {
      lastUserIdx = i;
      break;
    }
  }

  const kept: ModelMessage[] = [];

  allMessages.forEach((message, idx) => {
    if (idx > lastUserIdx) {
      kept.push(message);
      return;
    }
    if (message.role === 'tool') return;
    if (message.role !== 'assistant' || !Array.isArray(message.content)) {
      kept.push(message);
      return;
    }
    const content = message.content.filter(part => part.type !== 'tool-call');
    if (content.length === 0) return;
    kept.push({ ...message, content } as ModelMessage);
  });

  return kept;
}
