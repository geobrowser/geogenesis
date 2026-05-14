import type { JSONContent } from '@tiptap/core';

import { ID } from '~/core/id';

export const PERSONAL_PROFILE_BIO_STARTER_SESSION_KEY = 'geoPersonalProfileBioStarterV1';
export const PERSONAL_PROFILE_BIO_STARTER_MARKER = '// Delete this text below to create your own content.';
export const PERSONAL_PROFILE_BIO_STARTER_SLASH_HELP = 'I can type / to add text, image blocks, video blocks, data blocks and more.';

export const PERSONAL_PROFILE_BIO_STARTER_FORMATTING_HELP = 'I can also format this text by highlighting it and making it bold, italic or underlined. I can also link to other parts of Geo.';

const BLOCK_TYPES_WITH_ATTRS = new Set([
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'codeBlock',
  'image',
  'video',
  'tableNode',
]);

function assignBlockIds(node: JSONContent, spaceId: string): JSONContent {
  if (BLOCK_TYPES_WITH_ATTRS.has(node.type ?? '')) {
    return {
      ...node,
      attrs: { ...node.attrs, id: ID.createEntityId(), spaceId },
    };
  }
  return node;
}

function text(value: string): JSONContent {
  return { type: 'text', text: value };
}

function marked(value: string, marks: JSONContent['marks']): JSONContent {
  return { type: 'text', text: value, marks };
}

/** Opening line for the seeded profile bio (`node.textContent`). */
export function personalProfileBioStarterHeyLine(displayName: string): string {
  const name = displayName.trim() || 'there';
  return `Hey - I'm ${name}.`;
}

/**
 * TipTap document fragments for the profile overview bio starter — built as structured blocks
 * and marks (same shape as inserting via the editor), not HTML parsing.
 */
function buildPersonalProfileBioStarterBlocks(displayName: string): JSONContent[] {
  return [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [text('Bio')],
    },
    {
      type: 'paragraph',
      content: [marked(PERSONAL_PROFILE_BIO_STARTER_MARKER, [{ type: 'bold' }])],
    },
    {
      type: 'paragraph',
      content: [text(personalProfileBioStarterHeyLine(displayName))],
    },
    {
      type: 'paragraph',
      content: [text(PERSONAL_PROFILE_BIO_STARTER_SLASH_HELP)],
    },
    {
      type: 'paragraph',
      content: [
        text('I can also format this text by highlighting it and making it '),
        marked('bold', [{ type: 'bold' }]),
        text(', '),
        marked('italic', [{ type: 'italic' }]),
        text(' or '),
        marked('underlined', [{ type: 'underline' }]),
        text('. I can also link to other parts of '),
        marked('Geo', [{ type: 'link', attrs: { href: 'graph://6b9f649e38b64224927dd66171343730?s=a19c345ab9866679b001d7d2138d88a1' } }]),
        text('.'),
      ],
    },
  ];
}

export function buildPersonalProfileBioStarterDocJson(displayName: string, spaceId: string): JSONContent {
  const blocks = buildPersonalProfileBioStarterBlocks(displayName).map(n => assignBlockIds(n, spaceId));
  blocks.push({
    type: 'paragraph',
    attrs: {
      id: ID.createEntityId(),
      spaceId,
      tailPlaceholder: true,
    },
    content: [],
  });
  return {
    type: 'doc',
    content: blocks,
  };
}
