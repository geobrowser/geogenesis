import MarkdownIt from 'markdown-it';
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';

export function bracketMathPlugin(md: MarkdownIt) {
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
    if (state.src.charCodeAt(state.pos + 1) === 0x24) return false;

    const start = state.pos + 1;
    if (start >= state.posMax) return false;

    const firstChar = state.src.charCodeAt(start);
    if (firstChar === 0x20 || firstChar === 0x09 || firstChar === 0x0a) return false;

    let end = start;
    while (end < state.posMax) {
      if (state.src.charCodeAt(end) === 0x24 /* $ */) break;
      if (state.src.charCodeAt(end) === 0x5c /* \ */) {
        end++;
      }
      end++;
    }

    if (end >= state.posMax) return false;

    const lastChar = state.src.charCodeAt(end - 1);
    if (lastChar === 0x20 || lastChar === 0x09 || lastChar === 0x0a) return false;

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

export function createMarkdownIt(): MarkdownIt {
  const md = new MarkdownIt({ html: false });
  md.use(bracketMathPlugin);
  return md;
}

export function sanitizeRenderedLinkUrl(href: string | null): string | null {
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
