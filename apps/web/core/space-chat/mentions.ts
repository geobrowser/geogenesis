import { dashlessId } from '~/core/debates/api';

/** `<@person_id>`, the id dashed or dashless. */
const MENTION_TOKEN = /<@([0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12})>/g;

export type MessageSegment = { kind: 'text'; text: string } | { kind: 'mention'; personId: string };

/** A body split into its text and its mention tokens, in order. */
export function messageSegments(body: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let last = 0;
  for (const match of body.matchAll(MENTION_TOKEN)) {
    const at = match.index ?? 0;
    if (at > last) segments.push({ kind: 'text', text: body.slice(last, at) });
    segments.push({ kind: 'mention', personId: dashlessId(match[1]!.toLowerCase()) });
    last = at + match[0].length;
  }
  if (last < body.length) segments.push({ kind: 'text', text: body.slice(last) });
  return segments;
}

/** The person ids a body mentions, dashless and unique. */
export function mentionedIds(body: string): string[] {
  return [...new Set(messageSegments(body).flatMap(segment => (segment.kind === 'mention' ? [segment.personId] : [])))];
}

/** A person picked in the composer, as `@name` in the draft. */
export type DraftMention = { personId: string; name: string };

/**
 * The draft as sent: each picked `@name` still in the text becomes its token. Longer names first,
 * so `@Ann Lee` is not taken as `@Ann` followed by text.
 */
export function draftToBody(draft: string, mentions: DraftMention[]): string {
  let body = draft;
  const byLength = [...mentions].sort((a, b) => b.name.length - a.name.length);
  for (const mention of byLength) {
    body = body.split(`@${mention.name}`).join(`<@${dashlessId(mention.personId)}>`);
  }
  return body;
}

/** A stored body as an editable draft, with its tokens back as `@name`. */
export function bodyToDraft(
  body: string,
  nameOf: (personId: string) => string | null
): {
  draft: string;
  mentions: DraftMention[];
} {
  const mentions: DraftMention[] = [];
  const draft = messageSegments(body)
    .map(segment => {
      if (segment.kind === 'text') return segment.text;
      const name = nameOf(segment.personId);
      // An unresolved token stays a token, so the edit does not drop the mention.
      if (!name) return `<@${segment.personId}>`;
      if (!mentions.some(mention => mention.personId === segment.personId)) {
        mentions.push({ personId: segment.personId, name });
      }
      return `@${name}`;
    })
    .join('');
  return { draft, mentions };
}

/**
 * The `@query` the caret sits at the end of, for the picker: `null` when the caret is not in one.
 * The `@` starts the draft or follows whitespace.
 */
export function mentionQueryAt(draft: string, caret: number): { start: number; query: string } | null {
  const before = draft.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(before[at - 1]!)) return null;
  const query = before.slice(at + 1);
  if (query.length > 32 || /[\n@]/.test(query) || /\s\s/.test(query)) return null;
  return { start: at, query };
}
