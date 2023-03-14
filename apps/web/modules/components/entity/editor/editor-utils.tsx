import { Extensions, generateHTML, JSONContent } from '@tiptap/react';
import TurndownService from 'turndown';

const turndownService = new TurndownService();

interface TiptapNode {
  content: string;
  nodeName?: string;
  type?: string;
  attrs?: Record<string, unknown>;
}

export const tiptapJsonToTriples = ({
  content,
  extensions,
  spaceId,
  entityId,
}: {
  content: JSONContent[];
  extensions: Extensions;
  spaceId: string;
  entityId: string;
}) => {
  /* We are converting TipTap text nodes to a markdown representation for backwards compatibility */

  return content.map(node => {
    if (node.type === 'tableNode') {
      return node;
    } else {
      const html = generateHTML({ type: 'doc', content: [node] }, extensions);
      const nodeNameLength = 20;
      const nodeName = htmlToPlainText(html).slice(0, nodeNameLength);
      const markdown = turndownService.turndown(html);
      return { ...node, content: markdown, nodeName };
    }
  });
};

export const htmlToPlainText = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
};
