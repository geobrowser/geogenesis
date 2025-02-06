export function htmlToMarkdown(html: string): string {
  let md = html;

  // Convert headings
  md = md.replace(/<h1>(.*?)<\/h1>/gi, '# $1\n');
  md = md.replace(/<h2>(.*?)<\/h2>/gi, '## $1\n');
  md = md.replace(/<h3>(.*?)<\/h3>/gi, '### $1\n');
  md = md.replace(/<h4>(.*?)<\/h4>/gi, '#### $1\n');
  md = md.replace(/<h5>(.*?)<\/h5>/gi, '##### $1\n');
  md = md.replace(/<h6>(.*?)<\/h6>/gi, '###### $1\n');

  // Convert paragraphs
  md = md.replace(/<p>(.*?)<\/p>/gi, '$1\n\n');

  // Convert bold
  md = md.replace(/<strong>(.*?)<\/strong>/gi, '**$1**');

  // Convert italic
  md = md.replace(/<em>(.*?)<\/em>/gi, '*$1*');

  // Convert links
  md = md.replace(/<a href="(.*?)">(.*?)<\/a>/gi, '[$2]($1)');

  const ulRegex = /<ul[^>]*>([\s\S]*?)<\/ul>/g;
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/g;

  md = md.replace(ulRegex, match => {
    const listItems = [];
    let liMatch;

    // Extract text content from <li> tags
    while ((liMatch = liRegex.exec(match)) !== null) {
      const cleanedText = liMatch[1]
        .replace(/<[^>]*>/g, '') // Remove any nested HTML tags
        .trim();
      listItems.push(`- ${cleanedText}`);
    }

    return listItems.join('\n');
  });

  // Convert ordered lists
  md = md.replace(/<ol>(.*?)<\/ol>/gis, match => {
    let counter = 1;
    return match.replace(/<li>(.*?)<\/li>/gi, () => `${counter++}. $1\n`);
  });

  // Convert blockquotes
  // We don't support blockquotes atm
  // md = md.replace(/<blockquote>(.*?)<\/blockquote>/gi, '> $1\n');

  // Convert code blocks
  // We don't support code blocks atm
  // md = md.replace(/<pre><code>(.*?)<\/code><\/pre>/gi, '```\n$1\n```\n');

  // Convert inline code
  // We don't support inline code atm
  // md = md.replace(/<code>(.*?)<\/code>/gi, '`$1`');

  // Remove remaining tags
  md = md.replace(/<[^>]*>/g, '');

  // Decode HTML entities
  md = md.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

  return md.trim();
}

export function markdownToHtml(markdown: string): string {
  let html = markdown;

  // Convert headings
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
  html = html.replace(/^##### (.*$)/gim, '<h5>$1</h5>');
  html = html.replace(/^###### (.*$)/gim, '<h6>$1</h6>');

  // Convert list items
  html = html.replace(/^- (.*$)/gim, '<li>$1</li>');

  // Convert paragraphs
  html = html.replace(/^\s*(\n)?(.+)/gim, function (m) {
    // eslint-disable-next-line no-useless-escape
    return /\<(\/)?(h\d|ul|ol|li|blockquote|pre|img)/.test(m) ? m : '<p>' + m + '</p>';
  });

  // Convert bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Convert italic
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Convert links
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');

  // Convert unordered lists
  html = html.replace(/^\s*(-|\*)\s(.*)$/gim, '<ul>\n<li>$2</li>\n</ul>');
  html = html.replace(/<\/ul>\s*<ul>/g, '');

  // Convert ordered lists
  html = html.replace(/^\s*(\d+\.)\s(.*)$/gim, '<ol>\n<li>$2</li>\n</ol>');
  html = html.replace(/<\/ol>\s*<ol>/g, '');

  // Convert blockquotes
  // eslint-disable-next-line no-useless-escape
  html = html.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');

  // Convert code blocks
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

  // Convert inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Convert line breaks
  html = html.replace(/\n/g, '<br>');

  return html.trim();
}

export function htmlToPlainText(html: string) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
}
