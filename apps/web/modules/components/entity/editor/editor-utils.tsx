import showdown from 'showdown';

const markdownConverter = new showdown.Converter();

export const htmlToPlainText = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
};
