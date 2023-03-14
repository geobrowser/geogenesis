interface TiptapNode {
  content: string;
  nodeName?: string;
  type?: string;
  attrs?: Record<string, unknown>;
}

export const htmlToPlainText = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
};
