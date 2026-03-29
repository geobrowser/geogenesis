import type { Extensions } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import { generateJSON } from '@tiptap/html';
import katex from 'katex';
import MarkdownIt from 'markdown-it';
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';
import type Token from 'markdown-it/lib/token.mjs';

// ---------------------------------------------------------------------------
// Shared markdown-it plugin & singleton instances
// ---------------------------------------------------------------------------

function bracketMathPlugin(md: MarkdownIt) {
  // Inline rule for \(...\) bracket math — must run BEFORE 'escape' so \( isn't consumed as escaped paren
  md.inline.ruler.before('escape', 'bracket_math', (state: StateInline, silent: boolean) => {
    if (state.src.charCodeAt(state.pos) !== 0x5c /* \ */) return false;
    if (state.src.charCodeAt(state.pos + 1) !== 0x28 /* ( */) return false;

    const start = state.pos + 2;
    let end = start;
    while (end < state.posMax) {
      if (state.src.charCodeAt(end) === 0x5c /* \ */ && state.src.charCodeAt(end + 1) === 0x29 /* ) */) {
        break;
      }
      end++;
    }
    if (end >= state.posMax) return false;

    if (!silent) {
      const token = state.push('inline_math', 'math', 0);
      token.content = state.src.slice(start, end);
    }

    state.pos = end + 2;
    return true;
  });

  // Legacy read support: $...$ with boundary constraints
  md.inline.ruler.after('bracket_math', 'dollar_math', (state: StateInline, silent: boolean) => {
    if (state.src.charCodeAt(state.pos) !== 0x24 /* $ */) return false;
    // Don't match $$ (display math)
    if (state.src.charCodeAt(state.pos + 1) === 0x24) return false;

    const start = state.pos + 1;
    // Require non-whitespace immediately after opening $
    if (start >= state.posMax) return false;
    const firstChar = state.src.charCodeAt(start);
    if (firstChar === 0x20 || firstChar === 0x09 || firstChar === 0x0a) return false;

    let end = start;
    while (end < state.posMax) {
      if (state.src.charCodeAt(end) === 0x24 /* $ */) break;
      // Skip escaped characters
      if (state.src.charCodeAt(end) === 0x5c /* \ */) {
        end++;
      }
      end++;
    }
    if (end >= state.posMax) return false;

    // Require non-whitespace immediately before closing $
    const lastChar = state.src.charCodeAt(end - 1);
    if (lastChar === 0x20 || lastChar === 0x09 || lastChar === 0x0a) return false;

    // Disallow trailing digit after closing $ (avoid matching "$5 and $10")
    if (end + 1 < state.posMax) {
      const afterClose = state.src.charCodeAt(end + 1);
      if (afterClose >= 0x30 && afterClose <= 0x39) return false;
    }

    if (!silent) {
      const token = state.push('inline_math', 'math', 0);
      token.content = state.src.slice(start, end);
    }

    state.pos = end + 1;
    return true;
  });
}

// Singleton for markdownToEditorJson — renders math as tiptap-compatible span
const editorMd = new MarkdownIt({ html: false });
editorMd.use(bracketMathPlugin);
editorMd.renderer.rules['inline_math'] = (tokens: Token[], idx: number) => {
  const latex = tokens[idx].content;
  const escaped = latex
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<span data-type="inlineMath" data-latex="${escaped}">${escapeHtml(latex)}</span>`;
};

// Singleton for markdownToRenderedHtml — renders with editor-matching CSS classes
const renderMd = new MarkdownIt({ html: false });
renderMd.use(bracketMathPlugin);
renderMd.renderer.rules['paragraph_open'] = () =>
  '<div class="react-renderer node-paragraph"><div class="whitespace-normal"><p>';
renderMd.renderer.rules['paragraph_close'] = () => '</p></div></div>';
renderMd.renderer.rules['link_open'] = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const href = token.attrGet('href');
  const safeHref = sanitizeRenderedLinkUrl(href);

  if (safeHref) {
    token.attrSet('href', safeHref);
    return self.renderToken(tokens, idx, options);
  }

  token.attrs = (token.attrs ?? []).filter(([name]) => name !== 'href');
  token.attrSet('data-invalid-link', 'true');
  return self.renderToken(tokens, idx, options);
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
  return generateJSON(html, extensions ?? getExtensions());
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
    case 'paragraph':
      return serializeInlineContent(node.content ?? []) + '\n';
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
      return (node.content ?? [])
        .map((child, i) => serializeListItem(child, `${i + 1}.`))
        .join('');
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

    for (const mark of marks) {
      switch (mark.type) {
        case 'code':
          return `\`${text}\``;
        case 'bold':
          text = `**${text}**`;
          break;
        case 'italic':
          text = `*${text}*`;
          break;
        case 'link': {
          const href = mark.attrs?.href ?? '';
          text = `[${text}](${href})`;
          break;
        }
      }
    }

    return text;
  }

  if (node.type === 'inlineMath') {
    const latex = node.attrs?.latex ?? '';
    return `\\(${latex}\\)`;
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

function sanitizeRenderedLinkUrl(href: string | null): string | null {
  if (!href) return null;

  const trimmedHref = href.trim();
  if (!trimmedHref) return null;

  if (
    trimmedHref.startsWith('/') ||
    trimmedHref.startsWith('./') ||
    trimmedHref.startsWith('../') ||
    trimmedHref.startsWith('#') ||
    trimmedHref.startsWith('?')
  ) {
    return trimmedHref;
  }

  const schemeMatch = trimmedHref.match(/^([a-zA-Z][a-zA-Z\d+.-]*):/);
  if (!schemeMatch) {
    return trimmedHref;
  }

  const scheme = schemeMatch[1].toLowerCase();
  if (scheme === 'http' || scheme === 'https' || scheme === 'graph' || scheme === 'mailto' || scheme === 'tel') {
    return trimmedHref;
  }

  return null;
}
