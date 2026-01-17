export function htmlToMarkdown(html: string): string {
  // Create a temporary DOM element to parse HTML properly
  if (typeof window === 'undefined') {
    // Simple fallback for SSR
    return html.replace(/<[^>]*>/g, '').trim();
  }

  const temp = document.createElement('div');
  temp.innerHTML = html;

  function processNode(node: Node, indent: string = ''): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || '';
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const element = node as Element;
    const tagName = element.tagName.toLowerCase();
    let result = '';

    switch (tagName) {
      case 'h1':
        result = `# ${getTextContent(element)}\n`;
        break;
      case 'h2':
        result = `## ${getTextContent(element)}\n`;
        break;
      case 'h3':
        result = `### ${getTextContent(element)}\n`;
        break;
      case 'h4':
        result = `#### ${getTextContent(element)}\n`;
        break;
      case 'h5':
        result = `##### ${getTextContent(element)}\n`;
        break;
      case 'h6':
        result = `###### ${getTextContent(element)}\n`;
        break;
      case 'p':
        result = `${processChildren(element, indent)}\n\n`;
        break;
      case 'strong':
      case 'b':
        result = `**${processChildren(element, indent)}**`;
        break;
      case 'em':
      case 'i':
        result = `*${processChildren(element, indent)}*`;
        break;
      case 'a': {
        const href = element.getAttribute('href') || '';
        const text = processChildren(element, indent);
        result = `[${text}](${href})`;
        break;
      }
      case 'ol':
      case 'ul':
        result = processListItems(element, indent);
        break;
      case 'li':
        // This shouldn't be called directly, handled by ul/ol
        result = processChildren(element, indent);
        break;
      case 'br':
        result = '\n';
        break;
      case 'span': {
        // Preserve span elements with their attributes as HTML in markdown
        const attributes = Array.from(element.attributes)
          .map(attr => `${attr.name}="${attr.value}"`)
          .join(' ');
        const content = processChildren(element, indent);
        result = `<span${attributes ? ' ' + attributes : ''}>${content}</span>`;
        break;
      }
      default:
        // For any other tags, just process children
        result = processChildren(element, indent);
    }

    return result;
  }

  function processChildren(element: Element, indent: string = ''): string {
    const results: string[] = [];

    for (let i = 0; i < element.childNodes.length; i++) {
      const child = element.childNodes[i];
      const processed = processNode(child, indent);
      if (processed) {
        results.push(processed);
      }
    }

    return results.join('');
  }

  function processListItems(listElement: Element, indent: string = ''): string {
    const items: string[] = [];

    for (let i = 0; i < listElement.children.length; i++) {
      const child = listElement.children[i];
      if (child.tagName.toLowerCase() === 'li') {
        let itemContent = '';

        // Process each child of the li
        for (let j = 0; j < child.childNodes.length; j++) {
          const liChild = child.childNodes[j];

          if (liChild.nodeType === Node.ELEMENT_NODE) {
            const childElement = liChild as Element;
            const childTag = childElement.tagName.toLowerCase();

            if (childTag === 'ul') {
              // Handle nested list
              const nestedList = processNode(liChild, indent + '  ');
              if (itemContent.trim()) {
                // If there's content before the nested list, add it as a bullet point
                const bullet = `${indent}- `;
                items.push(`${bullet}${itemContent.trim()}`);
              }
              items.push(nestedList);
              itemContent = ''; // Reset for any content after the nested list
            } else {
              // Regular content
              itemContent += processNode(liChild, indent);
            }
          } else {
            // Text node
            itemContent += processNode(liChild, indent);
          }
        }

        // Add any remaining content as a list item
        if (itemContent.trim()) {
          const bullet = `${indent}- `;
          items.push(`${bullet}${itemContent.trim()}`);
        }
      }
    }

    return items.join('\n');
  }

  function getTextContent(element: Element): string {
    // Get text content while preserving inline formatting
    return processChildren(element, '');
  }

  // Process all children of the temp div
  const results: string[] = [];
  for (let i = 0; i < temp.childNodes.length; i++) {
    const processed = processNode(temp.childNodes[i]);
    if (processed) {
      results.push(processed);
    }
  }

  return results.join('').trim();
}

export function markdownToHtml(markdown: string): string {
  const lines = markdown.split('\n');
  const output: string[] = [];
  const listStack: Array<{ type: 'ul'; depth: number }> = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let i = 0;

  function processInlineFormatting(text: string): string {
    // Process inline formatting in the correct order
    // Links first (to avoid interfering with other formatting)
    // Only convert graph:// URLs to anchor tags, leave web2 URLs as markdown for Web2URLExtension to handle
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, url) => {
      // Only convert to anchor tag if it's a graph:// URL
      if (url.startsWith('graph://')) {
        return `<a href="${url}">${linkText}</a>`;
      }
      // Leave web2 URLs (http/https/www) as markdown text for Web2URLExtension to process
      return match;
    });

    // Bold (must come before italic to handle ***text*** correctly)
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Inline code
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

    return text;
  }

  function closeListsToDepth(targetDepth: number) {
    while (listStack.length > 0 && listStack[listStack.length - 1].depth > targetDepth) {
      const list = listStack.pop()!;
      output.push(`${'  '.repeat(list.depth)}</${list.type}>`);
    }
  }

  while (i < lines.length) {
    const line = lines[i];

    // Handle code blocks
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        output.push(`<pre><code>${codeBlockContent.join('\n')}</code></pre>`);
        codeBlockContent = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      i++;
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      i++;
      continue;
    }

    // Check for list items
    const bulletMatch = line.match(/^(\s*)- (.*)$/);

    if (bulletMatch) {
      const indent = bulletMatch[1].length;
      const content = processInlineFormatting(bulletMatch[2]);
      const depth = Math.floor(indent / 2); // 2 spaces per indent level

      // Close any lists that are deeper than current level
      closeListsToDepth(depth);

      // Open new list if needed
      if (listStack.length === 0 || listStack[listStack.length - 1].depth < depth) {
        output.push(`${'  '.repeat(depth)}<ul>`);
        listStack.push({ type: 'ul', depth });
      }

      // Add list item
      output.push(`${'  '.repeat(depth + 1)}<li>${content}</li>`);
      i++;
      continue;
    }

    // If we're here, it's not a list item, so close all lists
    closeListsToDepth(-1);

    // Skip empty lines
    if (!line.trim()) {
      i++;
      continue;
    }

    // Handle headings
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = processInlineFormatting(headingMatch[2]);
      output.push(`<h${level}>${content}</h${level}>`);
      i++;
      continue;
    }

    // Handle blockquotes
    if (line.startsWith('> ')) {
      const content = processInlineFormatting(line.substring(2));
      output.push(`<blockquote>${content}</blockquote>`);
      i++;
      continue;
    }

    // Handle horizontal rules
    if (line.match(/^(-{3,}|_{3,}|\*{3,})$/)) {
      output.push('<hr>');
      i++;
      continue;
    }

    // Group consecutive plain text lines into a single paragraph with <br> tags
    // The current line (at the start of this section) is plain text, but we need to check
    // subsequent lines while grouping to see when to stop
    const paragraphLines: string[] = [];
    while (i < lines.length) {
      const currentLine = lines[i];

      // Stop grouping if this upcoming line is a markdown element
      // (break back to outer loop which will process it with the handlers above)
      if (
        !currentLine.trim() || // Empty line (paragraph break)
        currentLine.match(/^(#{1,6})\s+/) || // Heading
        currentLine.startsWith('> ') || // Blockquote
        currentLine.match(/^(-{3,}|_{3,}|\*{3,})$/) || // Horizontal rule
        currentLine.match(/^(\s*)- /)
      ) {
        // Bullet list
        break;
      }

      paragraphLines.push(processInlineFormatting(currentLine));
      i++;
    }

    if (paragraphLines.length > 0) {
      output.push(`<p>${paragraphLines.join('<br>')}</p>`);
    }
  }

  // Close any remaining open lists
  closeListsToDepth(-1);

  // Close any unclosed code block
  if (inCodeBlock && codeBlockContent.length > 0) {
    output.push(`<pre><code>${codeBlockContent.join('\n')}</code></pre>`);
  }

  return output.join('\n').trim();
}

export function htmlToPlainText(html: string) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
}
