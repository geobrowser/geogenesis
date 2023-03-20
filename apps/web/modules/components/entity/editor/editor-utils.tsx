export const htmlToPlainText = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
};

/* Helps ensure we don't have any nodes with the same id attribute */
export const removeIdAttributes = (html: string) => {
  const regex = /\s*id\s*=\s*(['"])[^\1]*?\1/gi;
  return html.replace(regex, '');
};
