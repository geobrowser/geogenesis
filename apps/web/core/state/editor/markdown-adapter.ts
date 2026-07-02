import type { Extensions } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import { generateJSON } from '@tiptap/html';

import katex from 'katex';
import type Token from 'markdown-it/lib/token.mjs';

import {
  PROFILE_OVERVIEW_TAIL_BLOCK_SENTINEL,
  PROFILE_OVERVIEW_TAIL_PLACEHOLDER_TEXT,
} from '~/core/state/editor/profile-overview-tail-placeholder';

import { tokenizeWeb2Urls } from '~/core/utils/url-detection';

import { createMarkdownIt, getRenderedLinkState } from './markdown-core';

// Regex to identify web2 URLs (http, https, or www prefixed)
const WEB2_URL_RE = /^(https?:\/\/|www\.)/i;

// Singleton for markdownToEditorJson — renders math as tiptap-compatible span
const editorMd = createMarkdownIt();

// Convert web2 URL links to <span data-web2-url> so the web2URL mark's parseHTML
// can pick them up.  The GraphLinkExtension only accepts graph:// URLs, so plain
// <a> tags with http/www hrefs are stripped by generateJSON, losing the URL info.
editorMd.renderer.rules['link_open'] = (tokens: Token[], idx: number) => {
  const href = tokens[idx].attrGet('href') ?? '';
  if (WEB2_URL_RE.test(href)) {
    return `<span data-web2-url="true" data-url="${escapeHtml(href)}">`;
  }
  // Non-web2 links (e.g. graph://) — emit a normal <a>
  const attrs = (tokens[idx].attrs ?? []).map(([k, v]) => `${k}="${escapeHtml(v)}"`).join(' ');
  return `<a ${attrs}>`;
};

editorMd.renderer.rules['link_close'] = (tokens: Token[], idx: number) => {
  // Walk backwards to find the matching link_open to decide which tag to close.
  let openIdx = idx - 1;
  while (openIdx >= 0 && tokens[openIdx].type !== 'link_open') {
    openIdx--;
  }
  const href = openIdx >= 0 ? (tokens[openIdx].attrGet('href') ?? '') : '';
  return WEB2_URL_RE.test(href) ? '</span>' : '</a>';
};

editorMd.renderer.rules['inline_math'] = (tokens: Token[], idx: number) => {
  const latex = tokens[idx].content;
  const escaped = latex.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<span data-type="inlineMath" data-latex="${escaped}">${escapeHtml(latex)}</span>`;
};

// Singleton for markdownToRenderedHtml — renders with editor-matching CSS classes
const renderMd = createMarkdownIt();
renderMd.renderer.rules['paragraph_open'] = () =>
  '<div class="react-renderer node-paragraph"><div class="whitespace-normal"><p>';
renderMd.renderer.rules['paragraph_close'] = () => '</p></div></div>';
renderMd.renderer.rules['link_open'] = (tokens, idx) => renderLinkTagOpen(tokens[idx]);
renderMd.renderer.rules['link_close'] = (tokens, idx) => {
  // Walk backwards to find the matching link_open to decide which tag to close.
  let openIdx = idx - 1;
  while (openIdx >= 0 && tokens[openIdx].type !== 'link_open') {
    openIdx--;
  }
  const href = openIdx >= 0 ? (tokens[openIdx].attrGet('href') ?? '') : '';
  const { isValid } = getRenderedLinkState(href);
  return isValid ? '</a>' : '</span>';
};
renderMd.renderer.rules['heading_open'] = (tokens: Token[], idx: number) => {
  const tag = tokens[idx].tag;
  return `<div class="react-renderer node-heading"><${tag}>`;
};
renderMd.renderer.rules['heading_close'] = (tokens: Token[], idx: number) => {
  const tag = tokens[idx].tag;
  return `</${tag}></div>`;
};
renderMd.renderer.rules['fence'] = (tokens: Token[], idx: number) => {
  const code = tokens[idx].content;
  const trimmedCode = code.endsWith('\n') ? code.slice(0, -1) : code;
  const lines = trimmedCode.split('\n');
  const lineNumbers = lines.map((_, i) => `<div>${i + 1}</div>`).join('');
  return (
    `<div class="code-block">` +
    `<div class="code-block-line-numbers" aria-hidden="true">${lineNumbers}</div>` +
    `<code>${escapeHtml(trimmedCode)}</code>` +
    `</div>`
  );
};
renderMd.renderer.rules['code_inline'] = (tokens: Token[], idx: number) => {
  return `<code class="inline-code">${escapeHtml(tokens[idx].content)}</code>`;
};
renderMd.renderer.rules['inline_math'] = (tokens: Token[], idx: number) => {
  const latex = tokens[idx].content;
  try {
    return katex.renderToString(latex, { throwOnError: false });
  } catch {
    return escapeHtml(latex);
  }
};

// ---------------------------------------------------------------------------
// markdownToEditorJson
// ---------------------------------------------------------------------------

// Lazy-loaded extensions to avoid pulling the full editor tree at module init time.
// This allows tests to provide their own extensions without needing the full React setup.
let _extensions: Extensions | null = null;

function getExtensions(): Extensions {
  if (!_extensions) {
    // Dynamic require — only runs at first call, not at module load
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _extensions = require('~/partials/editor/extensions').tiptapExtensions;
  }
  return _extensions!;
}

/**
 * Parse persisted Markdown into Tiptap-compatible JSON.
 * Uses markdown-it for parsing and Tiptap's generateJSON for the final conversion.
 *
 * @param extensions — optional override for Tiptap extensions (used in tests)
 */
export function markdownToEditorJson(markdown: string, extensions?: Extensions): JSONContent {
  const html = editorMd.render(markdown);
  const json = generateJSON(html, extensions ?? getExtensions());
  return markWeb2UrlsInJson(json);
}

// Pre-marks raw web2 URLs (e.g. "https://x.com" typed as plain text) with the
// web2URL mark so the editor's FIRST paint renders them as styled anchors.
// Markdown links ([label](url)) are already converted to web2URL spans by
// editorMd above; this closes the gap for raw URLs, which markdown-it leaves as
// plain text (linkify is off). Without this, only the async detection plugin
// adds the mark (~150ms after mount), so links visibly flicker from plain text
// to styled on every editor (re)mount.
function markWeb2UrlsInJson(node: JSONContent): JSONContent {
  if (!node.content) return node;

  const content: JSONContent[] = [];
  for (const child of node.content) {
    const alreadyLinked = (child.marks ?? []).some(
      mark => mark.type === 'link' || mark.type === 'web2URL'
    );

    if (child.type === 'text' && typeof child.text === 'string' && !alreadyLinked) {
      const segments = tokenizeWeb2Urls(child.text);
      if (segments.some(segment => segment.type === 'url')) {
        for (const segment of segments) {
          if (!segment.value) continue;
          content.push({
            ...child,
            text: segment.value,
            ...(segment.type === 'url'
              ? { marks: [...(child.marks ?? []), { type: 'web2URL', attrs: { url: segment.value, editMode: false } }] }
              : {}),
          });
        }
        continue;
      }
    }

    content.push(markWeb2UrlsInJson(child));
  }

  return { ...node, content };
}

// ---------------------------------------------------------------------------
// editorNodeToMarkdown
// ---------------------------------------------------------------------------

export function editorNodeToMarkdown(node: JSONContent): string {
  const lines = serializeNode(node);
  return lines.trimEnd();
}

function serializeNode(node: JSONContent): string {
  switch (node.type) {
    case 'doc':
      return (node.content ?? []).map(serializeNode).join('\n');
    case 'paragraph': {
      const body = serializeInlineContent(node.content ?? []);
      const trimmed = body.trim();
      if (node.attrs?.tailPlaceholder) {
        if (trimmed === '' || trimmed === PROFILE_OVERVIEW_TAIL_PLACEHOLDER_TEXT) {
          return `${PROFILE_OVERVIEW_TAIL_BLOCK_SENTINEL}\n`;
        }
      } else if (trimmed === PROFILE_OVERVIEW_TAIL_PLACEHOLDER_TEXT) {
        return `${PROFILE_OVERVIEW_TAIL_BLOCK_SENTINEL}\n`;
      }
      return body + '\n';
    }
    case 'heading': {
      const level = node.attrs?.level ?? 1;
      const prefix = '#'.repeat(level);
      return `${prefix} ${serializeInlineContent(node.content ?? [])}\n`;
    }
    case 'codeBlock': {
      // markdown-it/tiptap may store a trailing newline in code block content; strip it for clean output
      const rawCode = (node.content ?? []).map(c => c.text ?? '').join('');
      const code = rawCode.endsWith('\n') ? rawCode.slice(0, -1) : rawCode;
      let fenceLen = 3;
      const backtickRun = code.match(/`{3,}/g);
      if (backtickRun) {
        fenceLen = Math.max(...backtickRun.map(r => r.length)) + 1;
      }
      const fence = '`'.repeat(fenceLen);
      return `${fence}\n${code}\n${fence}\n`;
    }
    case 'bulletList':
      return (node.content ?? []).map(child => serializeListItem(child, '-')).join('');
    case 'orderedList':
      return (node.content ?? []).map((child, i) => serializeListItem(child, `${i + 1}.`)).join('');
    case 'listItem':
      return (node.content ?? []).map(serializeNode).join('');
    case 'hardBreak':
      return '\n';
    default:
      // For unknown node types, try to serialize children
      if (node.content) {
        return node.content.map(serializeNode).join('');
      }
      return '';
  }
}

function serializeListItem(node: JSONContent, bullet: string, indent: string = ''): string {
  const children = node.content ?? [];
  const lines: string[] = [];

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.type === 'paragraph') {
      const text = serializeInlineContent(child.content ?? []);
      if (i === 0) {
        lines.push(`${indent}${bullet} ${text}\n`);
      } else {
        lines.push(`${indent}  ${text}\n`);
      }
    } else if (child.type === 'bulletList') {
      for (const grandchild of child.content ?? []) {
        lines.push(serializeListItem(grandchild, '-', indent + '  '));
      }
    } else if (child.type === 'orderedList') {
      (child.content ?? []).forEach((grandchild, idx) => {
        lines.push(serializeListItem(grandchild, `${idx + 1}.`, indent + '  '));
      });
    } else {
      lines.push(serializeNode(child));
    }
  }

  return lines.join('');
}

function serializeInlineContent(content: JSONContent[]): string {
  return content.map(serializeInlineNode).join('');
}

function serializeInlineNode(node: JSONContent): string {
  if (node.type === 'text') {
    let text = node.text ?? '';
    const marks = node.marks ?? [];

    const orderedMarks = [...marks].sort((a, z) => {
      if (a.type === 'underline' && z.type !== 'underline') return 1;
      if (z.type === 'underline' && a.type !== 'underline') return -1;
      return 0;
    });

    for (const mark of orderedMarks) {
      switch (mark.type) {
        case 'code':
          return serializeInlineCode(text);
        case 'bold':
          text = `**${text}**`;
          break;
        case 'italic':
          text = `*${text}*`;
          break;
        case 'underline':
          text = `++${text}++`;
          break;
        case 'link': {
          // Handle graph:// links (entity mentions) and other standard links
          const href = mark.attrs?.href ?? '';
          if (href) {
            text = `[${text}](${href})`;
          }
          break;
        }
        case 'web2URL': {
          const href = mark.attrs?.url ?? '';

          if (!href) {
            break;
          }

          if (/^\[[^\]]+\]\([^)]+\)$/.test(text)) {
            return text;
          }

          if (isStandaloneUrlText(text, href)) {
            return text;
          }

          text = `[${text}](${href})`;
          break;
        }
      }
    }

    return text;
  }

  if (node.type === 'inlineMath') {
    const latex = node.attrs?.latex ?? '';
    // Space-pad when content contains $ to avoid ambiguity with the delimiters
    // (covers start/end $ merging into $$, and internal $$ causing early close)
    const needsPad = latex.includes('$');
    return needsPad ? `$$ ${latex} $$` : `$$${latex}$$`;
  }

  if (node.type === 'hardBreak') {
    return '\n';
  }

  return '';
}

// ---------------------------------------------------------------------------
// markdownToRenderedHtml
// ---------------------------------------------------------------------------

export function markdownToRenderedHtml(markdown: string): string {
  return renderMd.render(markdown).trim();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function appendClassName(existingClassName: string | null, className: string): string {
  return existingClassName ? `${existingClassName} ${className}` : className;
}

function renderLinkTagOpen(token: Token): string {
  const { className, isValid, safeHref } = getRenderedLinkState(token.attrGet('href'));

  if (isValid && safeHref) {
    // Valid link → <a> tag
    const attrs = new Map(
      (token.attrs ?? []).filter(([name]) => name !== 'href' && name !== 'target' && name !== 'rel')
    );
    attrs.set('class', appendClassName(attrs.get('class') ?? null, className));
    attrs.set('href', safeHref);

    const serializedAttributes = Array.from(attrs.entries())
      .map(([name, value]) => `${name}="${escapeHtml(value)}"`)
      .join(' ');

    return `<a ${serializedAttributes}>`;
  }

  // Invalid link → <span> tag
  const attrs = new Map((token.attrs ?? []).filter(([name]) => name !== 'href' && name !== 'target' && name !== 'rel'));
  attrs.set('class', appendClassName(attrs.get('class') ?? null, className));
  attrs.set('data-invalid-link', 'true');

  const serializedAttributes = Array.from(attrs.entries())
    .map(([name, value]) => `${name}="${escapeHtml(value)}"`)
    .join(' ');

  return `<span ${serializedAttributes}>`;
}

function serializeInlineCode(text: string): string {
  const backtickRuns = text.match(/`+/g);
  const delimiterLength = backtickRuns ? Math.max(...backtickRuns.map(run => run.length)) + 1 : 1;
  const delimiter = '`'.repeat(delimiterLength);
  return `${delimiter}${text}${delimiter}`;
}

function isStandaloneUrlText(text: string, href: string): boolean {
  const trimmedText = text.trim();
  const trimmedHref = href.trim();

  if (!trimmedText || !trimmedHref) return false;
  if (trimmedText === trimmedHref) return true;

  return normalizeComparableUrl(trimmedText) === normalizeComparableUrl(trimmedHref);
}

function normalizeComparableUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
