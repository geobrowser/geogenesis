import * as React from 'react';

import cx from 'classnames';
import katex from 'katex';
import type Token from 'markdown-it/lib/token.mjs';

import { isWeb2Url, normalizeWeb2Url, tokenizeWeb2Urls } from '~/core/utils/url-detection';

import { createMarkdownIt, getRenderedLinkState } from './markdown-core';

type MarkdownRenderOptions = {
  textClassName?: string;
  markClassName?: string;
  codeBlockClassName?: string;
  // When true, raw web2 URLs in text and [label](web2url) links are rendered as
  // clickable anchors that match the editor's web2URL rendering. Used by the
  // browse-mode ServerContent so the server render matches the editor render and
  // links don't visibly change ("flicker") when the editor mounts.
  linkifyWeb2Urls?: boolean;
};

const markdownMd = createMarkdownIt();

// Mirrors the editor's view-mode web2URL anchor (see web2-url-extension.tsx
// renderHTML) so the server render and the editor render are pixel-identical.
function Web2Anchor({ url, children }: { url: string; children?: React.ReactNode }) {
  return (
    <a
      href={normalizeWeb2Url(url)}
      data-web2-url="true"
      data-url={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: '#202020', textDecoration: 'underline', cursor: 'pointer' }}
    >
      {children ?? url}
    </a>
  );
}

export function hasMarkdownSyntax(markdown: string): boolean {
  const tokens = markdownMd.parse(markdown, {});

  return tokens.some(token => {
    if (token.type === 'heading_open' || token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
      return true;
    }

    if (token.type === 'fence') {
      return true;
    }

    if (token.type !== 'inline') return false;

    return (token.children ?? []).some(
      child =>
        child.type === 'code_inline' ||
        child.type === 'inline_math' ||
        child.type === 'link_open' ||
        child.type === 'strong_open' ||
        child.type === 'em_open'
    );
  });
}

export function renderMarkdownInline(text: string, options?: MarkdownRenderOptions): React.ReactNode {
  const parsed = markdownMd.parseInline(text, {});
  const inlineToken = parsed.find(token => token.type === 'inline');
  const tokens = inlineToken?.children ?? [];

  return renderInlineTokens(tokens, options);
}

export function renderMarkdownDocument(markdown: string, options?: MarkdownRenderOptions): React.ReactNode[] {
  const tokens = markdownMd.parse(markdown, {});
  const { nodes } = renderBlockTokens(tokens, 0, undefined, options);
  return nodes;
}

function renderBlockTokens(
  tokens: Token[],
  startIndex: number,
  closeType?: string,
  options?: MarkdownRenderOptions
): { nodes: React.ReactNode[]; nextIndex: number } {
  const nodes: React.ReactNode[] = [];
  let index = startIndex;

  while (index < tokens.length) {
    const token = tokens[index];

    if (closeType && token.type === closeType) {
      return { nodes, nextIndex: index + 1 };
    }

    switch (token.type) {
      case 'paragraph_open': {
        const inlineToken = tokens[index + 1];
        const content = inlineToken?.type === 'inline' ? renderInlineTokens(inlineToken.children ?? [], options) : null;
        nodes.push(
          <div key={`paragraph-${index}`} className="react-renderer node-paragraph">
            <div className="whitespace-normal">
              <p>{content}</p>
            </div>
          </div>
        );
        index += 3;
        break;
      }

      case 'heading_open': {
        const level = Number.parseInt(token.tag.slice(1), 10) || 1;
        const inlineToken = tokens[index + 1];
        const content = inlineToken?.type === 'inline' ? renderInlineTokens(inlineToken.children ?? [], options) : null;
        nodes.push(
          <div key={`heading-${index}`} className="react-renderer node-heading">
            {renderHeading(level, content)}
          </div>
        );
        index += 3;
        break;
      }

      case 'bullet_list_open': {
        const rendered = renderBlockTokens(tokens, index + 1, 'bullet_list_close', options);
        nodes.push(<ul key={`bullet-list-${index}`}>{rendered.nodes}</ul>);
        index = rendered.nextIndex;
        break;
      }

      case 'ordered_list_open': {
        const startAttr = token.attrGet('start');
        const rendered = renderBlockTokens(tokens, index + 1, 'ordered_list_close', options);
        const start = startAttr ? Number.parseInt(startAttr, 10) : undefined;
        nodes.push(
          <ol key={`ordered-list-${index}`} start={Number.isFinite(start) ? start : undefined}>
            {rendered.nodes}
          </ol>
        );
        index = rendered.nextIndex;
        break;
      }

      case 'list_item_open': {
        const rendered = renderBlockTokens(tokens, index + 1, 'list_item_close', options);
        nodes.push(<li key={`list-item-${index}`}>{rendered.nodes}</li>);
        index = rendered.nextIndex;
        break;
      }

      case 'fence': {
        const code = token.content.endsWith('\n') ? token.content.slice(0, -1) : token.content;
        const lines = code.split('\n');
        nodes.push(
          <div key={`code-${index}`} className={cx('code-block', options?.codeBlockClassName)}>
            <div className="code-block-line-numbers" aria-hidden>
              {lines.map((_, lineIndex) => (
                <div key={lineIndex}>{lineIndex + 1}</div>
              ))}
            </div>
            <code className={options?.markClassName}>{code}</code>
          </div>
        );
        index += 1;
        break;
      }

      case 'inline': {
        nodes.push(
          <div key={`inline-${index}`} className="react-renderer node-paragraph">
            <div className="whitespace-normal">
              <p>{renderInlineTokens(token.children ?? [], options)}</p>
            </div>
          </div>
        );
        index += 1;
        break;
      }

      default:
        index += 1;
        break;
    }
  }

  return { nodes, nextIndex: index };
}

function renderInlineTokens(tokens: Token[], options?: MarkdownRenderOptions): React.ReactNode {
  const { nodes } = renderInlineTokenRange(tokens, 0, undefined, options);
  return nodes.length === 1 ? nodes[0] : <>{nodes}</>;
}

function renderInlineTokenRange(
  tokens: Token[],
  startIndex: number,
  closeType?: string,
  options?: MarkdownRenderOptions,
  // True while rendering the children of a link, so raw-URL text inside a link
  // is not turned into a (nested, invalid) anchor.
  insideLink = false
): { nodes: React.ReactNode[]; nextIndex: number } {
  const nodes: React.ReactNode[] = [];
  let index = startIndex;

  while (index < tokens.length) {
    const token = tokens[index];

    if (closeType && token.type === closeType) {
      return { nodes, nextIndex: index + 1 };
    }

    switch (token.type) {
      case 'text': {
        const segments = options?.linkifyWeb2Urls && !insideLink ? tokenizeWeb2Urls(token.content) : null;

        if (segments && segments.some(segment => segment.type === 'url')) {
          nodes.push(
            <span key={`text-${index}`} className={options?.textClassName}>
              {segments.map((segment, segmentIndex) =>
                segment.type === 'url' ? (
                  <Web2Anchor key={segmentIndex} url={segment.value} />
                ) : (
                  <React.Fragment key={segmentIndex}>{segment.value}</React.Fragment>
                )
              )}
            </span>
          );
        } else {
          nodes.push(
            <span key={`text-${index}`} className={options?.textClassName}>
              {token.content}
            </span>
          );
        }
        index += 1;
        break;
      }

      case 'softbreak':
      case 'hardbreak':
        nodes.push(<br key={`break-${index}`} />);
        index += 1;
        break;

      case 'code_inline':
        nodes.push(
          <code key={`code-${index}`} className={cx('inline-code', options?.markClassName)}>
            {token.content}
          </code>
        );
        index += 1;
        break;

      case 'inline_math': {
        const latex = token.content;
        let rendered = latex;
        let isKatex = false;

        try {
          rendered = katex.renderToString(latex, { throwOnError: false });
          isKatex = true;
        } catch {
          rendered = latex;
        }

        nodes.push(
          <span key={`math-${index}`} className={options?.markClassName}>
            {isKatex ? <span dangerouslySetInnerHTML={{ __html: rendered }} /> : rendered}
          </span>
        );
        index += 1;
        break;
      }

      case 'strong_open': {
        const rendered = renderInlineTokenRange(tokens, index + 1, 'strong_close', options, insideLink);
        nodes.push(<strong key={`strong-${index}`}>{rendered.nodes}</strong>);
        index = rendered.nextIndex;
        break;
      }

      case 'em_open': {
        const rendered = renderInlineTokenRange(tokens, index + 1, 'em_close', options, insideLink);
        nodes.push(<em key={`em-${index}`}>{rendered.nodes}</em>);
        index = rendered.nextIndex;
        break;
      }

      case 'link_open': {
        const href = token.attrGet('href');
        // Render the link's children without re-linkifying their text.
        const rendered = renderInlineTokenRange(tokens, index + 1, 'link_close', options, true);

        // Web2 links render as the editor's web2URL anchor so server and editor
        // markup match.
        if (options?.linkifyWeb2Urls && isWeb2Url(href)) {
          nodes.push(
            <Web2Anchor key={`link-${index}`} url={href}>
              {rendered.nodes}
            </Web2Anchor>
          );
          index = rendered.nextIndex;
          break;
        }

        const { className, isValid, safeHref } = getRenderedLinkState(href);

        if (isValid && safeHref) {
          nodes.push(
            <a key={`link-${index}`} href={safeHref} className={cx(className, options?.markClassName)}>
              {rendered.nodes}
            </a>
          );
        } else {
          nodes.push(
            <span key={`link-${index}`} data-invalid-link="true" className={cx(className, options?.markClassName)}>
              {rendered.nodes}
            </span>
          );
        }
        index = rendered.nextIndex;
        break;
      }

      default:
        if (token.content) {
          nodes.push(
            <span key={`fallback-${index}`} className={options?.textClassName}>
              {token.content}
            </span>
          );
        }
        index += 1;
        break;
    }
  }

  return { nodes, nextIndex: index };
}

function renderHeading(level: number, children: React.ReactNode): React.ReactNode {
  switch (level) {
    case 1:
      return <h1>{children}</h1>;
    case 2:
      return <h2>{children}</h2>;
    case 3:
      return <h3>{children}</h3>;
    case 4:
      return <h4>{children}</h4>;
    case 5:
      return <h5>{children}</h5>;
    case 6:
      return <h6>{children}</h6>;
    default:
      return <p>{children}</p>;
  }
}
