import { describe, expect, it } from 'vitest';

import { getFenceLength, isClosingFence, readFencedCodeBlock } from './markdown-fences';

describe('markdown-fences', () => {
  it('detects opening fence length', () => {
    expect(getFenceLength('```')).toBe(3);
    expect(getFenceLength('````js')).toBe(4);
    expect(getFenceLength('plain text')).toBe(null);
  });

  it('requires a closing fence at least as long as the opener', () => {
    expect(isClosingFence('```', 3)).toBe(true);
    expect(isClosingFence('````', 3)).toBe(true);
    expect(isClosingFence('```', 4)).toBe(false);
    expect(isClosingFence('```js', 3)).toBe(false);
  });

  it('reads fenced code blocks without truncating inner shorter fences', () => {
    const lines = ['````', 'before', '```js', 'after', '````', 'tail'];
    expect(readFencedCodeBlock(lines, 0)).toEqual({
      openingLine: '````',
      codeText: 'before\n```js\nafter',
      nextIndex: 5,
      closingLine: '````',
    });
  });
});
