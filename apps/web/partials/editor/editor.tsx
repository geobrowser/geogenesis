'use client';

import { GraphUrl } from '@geoprotocol/geo-sdk';
import { EditorContent, Editor as TiptapEditor, useEditor } from '@tiptap/react';
import { LayoutGroup } from 'framer-motion';
import { useRouter } from 'next/navigation';

import { useAtomValue } from 'jotai';

import * as React from 'react';

import { editorContentVersionAtom } from '~/atoms';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useEditorStore } from '~/core/state/editor/use-editor';
import { removeIdAttributes } from '~/core/state/editor/utils';
import { NavUtils } from '~/core/utils/utils';

import { Spacer } from '~/design-system/spacer';

import { NoContent } from '../space-tabs/no-content';
import { tiptapExtensions } from './extensions';
import { createIdExtension } from './id-extension';
import { ServerContent } from './server-content';

// Constants for emoji image conversion patterns
const EMOJI_CONVERSION_PATTERNS = [
  // Twitter emoji
  /<img[^>]*src="[^"]*twimg\.com\/emoji[^"]*"[^>]*alt="([^"]*)"[^>]*\/?>/gi,
  // General emoji images
  /<img[^>]*src="[^"]*emoji[^"]*"[^>]*alt="([^"]*)"[^>]*\/?>/gi,
  // Discord, Slack, etc emoji
  /<img[^>]*class="[^"]*emoji[^"]*"[^>]*alt="([^"]*)"[^>]*\/?>/gi,
  // Any image with emoji in alt text
  /<img[^>]*alt="([^"]*[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}][^"]*)"[^>]*\/?>/gu,
] as const;

interface Props {
  spaceId: string;
  placeholder?: React.ReactNode;
  shouldHandleOwnSpacing?: boolean;
  spacePage?: boolean;
}

export function Editor({ shouldHandleOwnSpacing, spaceId, placeholder = null, spacePage = false }: Props) {
  useSuppressFlushSyncWarning();
  const { upsertEditorState, editorJson, activeEntityId, blockIds, setHasContent } = useEditorStore();
  const editable = useUserIsEditing(spaceId);
  const editorContentVersion = useAtomValue(editorContentVersionAtom);

  const extensions = React.useMemo(() => [...tiptapExtensions, createIdExtension(spaceId)], [spaceId]);

  useInterceptEditorLinks(spaceId);

  // Ref keeps the blur handler fresh without requiring editor recreation.
  const upsertEditorStateRef = React.useRef(upsertEditorState);
  upsertEditorStateRef.current = upsertEditorState;

  const onBlur = (params: { editor: TiptapEditor }) => {
    if (editable) {
      // Responsible for converting all editor blocks to Geo knowledge graph state
      upsertEditorStateRef.current(params.editor.getJSON());
    }
  };

  const editor = useEditor(
    {
      extensions,
      editable: editable,
      content: editorJson,
      editorProps: {
        transformPastedHTML: html => {
          // Remove id attributes and prevent emoji conversion to images
          let cleanHtml = removeIdAttributes(html);

          // Apply all patterns to convert emoji images back to Unicode
          EMOJI_CONVERSION_PATTERNS.forEach(pattern => {
            cleanHtml = cleanHtml.replace(pattern, '$1');
          });

          return cleanHtml;
        },
        // Handle emoji conversion on paste
        handleDOMEvents: {
          paste: (view, event) => {
            // Get pasted content
            const clipboardData = event.clipboardData;
            if (clipboardData) {
              const textData = clipboardData.getData('text/plain');

              // Always prevent default and handle manually to avoid emoji conversion
              event.preventDefault();

              // Use plain text to preserve emoji as Unicode
              if (textData) {
                const lines = textData.split('\n');
                let tr = view.state.tr;

                lines.forEach((line, index) => {
                  if (index > 0) {
                    tr = tr.split(tr.selection.head);
                  }
                  if (line.trim()) {
                    tr = tr.insertText(line);
                  }
                });

                view.dispatch(tr);
                return true;
              }
            }
            return false;
          },
        },
      },
      immediatelyRender: false,
      onBlur: onBlur,
      onUpdate: ({ editor }) => {
        if (editable) {
          const hasContent =
            editor.getText().trim().length > 0 ||
            (editor.getJSON().content?.some(node => node.type === 'image' || node.type === 'tableNode') ?? false);

          // Update the state immediately to show/hide properties panel
          setHasContent(hasContent);
        }
      },
    },
    // NOTE: `editorJson` is intentionally excluded — including it destroys and
    // recreates the editor on every block addition, wiping data block state.
    // `activeEntityId` handles tab switches; `editorContentVersion` handles
    // external resets (discard, IndexedDB restore).
    [editable, activeEntityId, editorContentVersion]
  );

  // We are in browse mode and there is no content.
  if (!editable && blockIds.length === 0) {
    return (
      <>
        {spacePage && (
          <NoContent
            options={{
              image: '/overview.png',
              browse: {
                title: 'There’s no content here yet',
                description: 'Switch to edit mode to add content if you’re an editor of this space!',
              },
            }}
            isEditing={false}
          />
        )}
        <span>{placeholder}</span>
      </>
    );
  }

  return (
    <LayoutGroup id="editor">
      <div className={editable ? 'editable' : 'not-editable'}>
        {editor ? <EditorContent editor={editor} /> : <ServerContent content={editorJson.content} />}

        {shouldHandleOwnSpacing && <Spacer height={60} />}
      </div>
    </LayoutGroup>
  );
}

/**
 * Sets up listeners to intercept clicks on links on entity pages and redirect them to the
 * appropriate entity based on the `graph://` URI.
 *
 * This is one of the most hacky ways to do it, but is the least amount of effort to implement
 * for now. Alternative approaches are to use Linkify, which tiptap uses internally, to render
 * the links using a custom React component which can handle the `graph://` protocol, or to
 * somehow render the links as a React component through tiptap itself.
 */
function useInterceptEditorLinks(spaceId: string) {
  const router = useRouter();

  React.useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    // Mutation observer to catch and prevent emoji conversion
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            // Check if added node is an emoji image
            if (
              element.tagName === 'IMG' &&
              (element.getAttribute('src')?.includes('emoji') || element.getAttribute('src')?.includes('twimg.com'))
            ) {
              const alt = element.getAttribute('alt');
              if (alt) {
                const textNode = document.createTextNode(alt);
                element.parentNode?.replaceChild(textNode, element);
              }
            }
            // Also check child nodes
            const emojiImages = element.querySelectorAll('img[src*="emoji"], img[src*="twimg.com"]');
            emojiImages.forEach(img => {
              const alt = img.getAttribute('alt');
              if (alt) {
                const textNode = document.createTextNode(alt);
                img.parentNode?.replaceChild(textNode, img);
              }
            });
          }
        });
      });
    });

    // Observe the editor content
    const editorElement = document.querySelector('.ProseMirror');
    if (editorElement) {
      observer.observe(editorElement, {
        childList: true,
        subtree: true,
      });
    }

    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (!target) {
        return;
      }

      // @ts-expect-error target doesn't have "closest" method in types
      const link = target.closest('a');

      if (!link) {
        return;
      }

      // Check if the clicked element is a link
      if (link.tagName === 'A') {
        const originalUrl = link.href;

        if (originalUrl.startsWith('graph://')) {
          // Prevent the default link behavior
          event.stopPropagation();
          event.preventDefault();
          const entityId = GraphUrl.toEntityId(originalUrl);
          router.prefetch(NavUtils.toEntity(spaceId, entityId));
          router.push(NavUtils.toEntity(spaceId, entityId));
        }
      }
    }

    document.addEventListener('click', handleClick);

    return () => {
      document.removeEventListener('click', handleClick);
      observer.disconnect();
    };
  }, [router, spaceId]);
}

// Suppress TipTap's flushSync warning in dev - this is a known issue with TipTap + React 18
// https://github.com/ueberdosis/tiptap/issues/3764
const useSuppressFlushSyncWarning = () => {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    const originalError = console.error;
    console.error = (...args) => {
      if (typeof args[0] === 'string' && args[0].includes('flushSync was called from inside a lifecycle method')) {
        return;
      }
      originalError.apply(console, args);
    };
    return () => {
      console.error = originalError;
    };
  }, []);
};
