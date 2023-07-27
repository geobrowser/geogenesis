import Heading, { Level } from '@tiptap/extension-heading';
import { NodeViewContent, NodeViewRendererProps, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';

import * as React from 'react';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';

export const HeadingNode = Heading.extend({
  ...Heading,
  parseHTML() {
    return this.options.levels.map((level: Level) => ({
      tag: `h${level}`,
      attrs: { level },
      priority: 1000,
    }));
  },

  addOptions() {
    return {
      ...this.parent?.(),
      levels: [1, 2, 3] as Level[],
      HTMLAttributes: {},
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(HeadingNodeComponent);
  },
});

const tags: Record<Level, 'h1' | 'h2' | 'h3' | 'p'> = {
  1: 'h1',
  2: 'h2',
  3: 'h3',
  4: 'p',
  5: 'p',
  6: 'p',
};

function HeadingNodeComponent({ node }: NodeViewRendererProps) {
  const isEditable = useUserIsEditing(node.attrs.spaceId);

  const tag = tags[node.attrs.level as Level] ?? 'p';

  return (
    <NodeViewWrapper>
      <NodeViewContent as={tag} contentEditable={isEditable ? 'true' : 'false'} />
    </NodeViewWrapper>
  );
}
