import type { Editor, JSONContent } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';

import { ID } from '~/core/id';
import { PROFILE_OVERVIEW_TAIL_PLACEHOLDER_TEXT } from '~/core/state/editor/profile-overview-tail-placeholder';

export const PERSONAL_PROFILE_BIO_STARTER_SESSION_KEY = 'geoPersonalProfileBioStarterV1';

/** Seed overview copy until the user edits it away (task sync uses this). */
export const PERSONAL_PROFILE_BIO_STARTER_MARKER = '// Delete this text below to create your own content';

/** Plain text of the seeded “slash / blocks” paragraph (`node.textContent`). */
export const PERSONAL_PROFILE_BIO_STARTER_SLASH_HELP =
  'I can type / to add text, image blocks, video blocks, data blocks and more.';

/** Plain text of the seeded formatting demo paragraph (`node.textContent`). */
export const PERSONAL_PROFILE_BIO_STARTER_FORMATTING_HELP =
  'I can also format this text by highlighting it and making it bold, italic or underlined. I can also link to other parts of Geo.';

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

/**
 * TipTap document fragments for the profile overview bio starter — built as structured blocks
 * and marks (same shape as inserting via the editor), not HTML parsing.
 */
function buildPersonalProfileBioStarterBlocks(): JSONContent[] {
  return [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [text('Bio')],
    },
    {
      type: 'paragraph',
      content: [text(PERSONAL_PROFILE_BIO_STARTER_MARKER)],
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
        marked('Geo', [{ type: 'underline' }]),
        text('.'),
      ],
    },
  ];
}

/** `displayName` kept for callers / session payloads; no longer inserted into the seeded doc. */
export function buildPersonalProfileBioStarterDocJson(_displayName: string, spaceId: string): JSONContent {
  const blocks = buildPersonalProfileBioStarterBlocks().map(n => assignBlockIds(n, spaceId));
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

function isSlashHelpParagraphFuzzy(trimmed: string): boolean {
  if (!trimmed.startsWith('I can type / to add ')) return false;
  return trimmed.includes('image blocks') && trimmed.includes('data blocks') && trimmed.endsWith('more.');
}

/** Map a doc position to the index of the top-level block that contains it. */
function topLevelChildIndexContainingPos(doc: PMNode, pos: number): number {
  if (pos < 1 || pos >= doc.content.size + 1) return -1;
  let offset = 1;
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i);
    const end = offset + child.nodeSize;
    if (pos >= offset && pos < end) return i;
    offset = end;
  }
  return -1;
}

function caretPosBelowBioHeading(doc: PMNode): number | null {
  let pos = 1;
  for (let i = 0; i < doc.childCount; i++) {
    const node = doc.child(i);
    const nodeSize = node.nodeSize;
    if (node.type.name === 'heading' && node.attrs?.level === 2 && node.textContent.trim() === 'Bio') {
      if (i + 1 >= doc.childCount) {
        return Math.min(pos + nodeSize - 1, doc.content.size);
      }
      const insideNext = pos + nodeSize + 1;
      return Math.min(insideNext, doc.content.size);
    }
    pos += nodeSize;
  }
  return null;
}

function bioSectionStartChildIndex(doc: PMNode, tailChildIndex: number): number {
  for (let i = tailChildIndex; i >= 0; i--) {
    const n = doc.child(i);
    if (n.type.name === 'heading' && n.attrs?.level === 2 && n.textContent.trim() === 'Bio') {
      return i;
    }
  }
  return -1;
}

const LEGACY_HEY_INTRO_LINE = /^Hey - I'm\s+.+\.?$/;

function collectBioSeedParagraphDeleteRanges(
  doc: PMNode,
  minChildIndex: number,
  maxChildIndex: number,
  opts?: { stripLegacyHeyIntro?: boolean }
): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = [];
  let pos = 1;
  for (let i = 0; i < doc.childCount; i++) {
    const node = doc.child(i);
    const from = pos;
    const to = pos + node.nodeSize;
    pos = to;

    if (i < minChildIndex || i > maxChildIndex) continue;

    if (node.type.name !== 'paragraph') continue;

    const t = node.textContent.trim();

    if (opts?.stripLegacyHeyIntro && LEGACY_HEY_INTRO_LINE.test(t)) {
      ranges.push({ from, to });
      continue;
    }

    if (node.attrs?.tailPlaceholder) {
      ranges.push({ from, to });
      continue;
    }
    if (
      t === PROFILE_OVERVIEW_TAIL_PLACEHOLDER_TEXT ||
      /^Type \/ for commands or start writ/i.test(t)
    ) {
      ranges.push({ from, to });
      continue;
    }
    if (t === PERSONAL_PROFILE_BIO_STARTER_SLASH_HELP || isSlashHelpParagraphFuzzy(t)) {
      ranges.push({ from, to });
      continue;
    }
    const normalized = t.replace(/\s+/g, ' ').trim();
    if (
      t === PERSONAL_PROFILE_BIO_STARTER_FORMATTING_HELP ||
      normalized === PERSONAL_PROFILE_BIO_STARTER_FORMATTING_HELP
    ) {
      ranges.push({ from, to });
      continue;
    }
  }
  return ranges;
}

export type CollapseBioStarterOptions = {
  fromTailClick?: boolean;
  clickedDocPos?: number;
};

export function collapseBioStarterTemplateOnTailInteraction(
  editor: Editor,
  options?: CollapseBioStarterOptions
): boolean {
  const doc = editor?.state?.doc;
  if (!doc) return false;
  const state = editor.state;
  if (doc.childCount === 0) return false;

  let sawTailPlaceholder = false;
  doc.descendants(node => {
    if (node.attrs?.tailPlaceholder) {
      sawTailPlaceholder = true;
    }
  });
  const seedFingerprint =
    doc.textContent.includes('I can type / to add') &&
    (doc.textContent.includes(PROFILE_OVERVIEW_TAIL_PLACEHOLDER_TEXT) ||
      doc.textContent.includes('Type / for commands'));
  const bypassFingerprintGate = options?.fromTailClick === true;
  if (!bypassFingerprintGate && !sawTailPlaceholder && !seedFingerprint) return false;

  let minChild = 0;
  let maxChild = doc.childCount - 1;
  if (bypassFingerprintGate) {
    const clicked = options?.clickedDocPos;
    if (typeof clicked !== 'number') return false;
    const tailIdx = topLevelChildIndexContainingPos(doc, clicked);
    if (tailIdx < 0) return false;
    maxChild = tailIdx;
    const bioIdx = bioSectionStartChildIndex(doc, tailIdx);
    minChild = bioIdx >= 0 ? bioIdx : tailIdx;
  }

  const ranges = collectBioSeedParagraphDeleteRanges(doc, minChild, maxChild, {
    stripLegacyHeyIntro: bypassFingerprintGate,
  });
  if (ranges.length === 0) return false;

  ranges.sort((a, z) => z.from - a.from);
  let tr = state.tr;
  for (const { from, to } of ranges) {
    tr = tr.delete(from, to);
  }
  editor.view.dispatch(tr);

  const caret = caretPosBelowBioHeading(editor.state.doc);
  if (caret !== null) {
    editor.chain().focus().setTextSelection(caret).run();
  } else {
    editor.commands.focus();
  }
  return true;
}
