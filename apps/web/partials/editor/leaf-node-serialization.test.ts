import { generateHTML } from '@tiptap/react';
import { describe, expect, it } from 'vitest';

import { tiptapExtensions } from './extensions';

const toDoc = (node: Record<string, unknown>) => ({
  type: 'doc',
  content: [node],
});

describe('TipTap leaf node serialization', () => {
  it('serializes image nodes without throwing', () => {
    expect(() =>
      generateHTML(
        toDoc({
          type: 'image',
          attrs: {
            src: 'ipfs://image',
          },
        }),
        tiptapExtensions
      )
    ).not.toThrow();
  });

  it('serializes video nodes without throwing', () => {
    expect(() =>
      generateHTML(
        toDoc({
          type: 'video',
          attrs: {
            src: 'ipfs://video',
          },
        }),
        tiptapExtensions
      )
    ).not.toThrow();
  });

  it('serializes tableNode nodes without throwing', () => {
    expect(() =>
      generateHTML(
        toDoc({
          type: 'tableNode',
          attrs: {},
        }),
        tiptapExtensions
      )
    ).not.toThrow();
  });
});
