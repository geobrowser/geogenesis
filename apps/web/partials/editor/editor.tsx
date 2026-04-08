'use client';

import { GraphUrl } from '@geoprotocol/geo-sdk/lite';
import type { EditorView } from '@tiptap/pm/view';
import { EditorContent, JSONContent, Editor as TiptapEditor, useEditor } from '@tiptap/react';

import * as React from 'react';

import { LayoutGroup } from 'framer-motion';
import { useAtomValue } from 'jotai';
import { useRouter } from 'next/navigation';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useEditorStore } from '~/core/state/editor/use-editor';
import { removeIdAttributes } from '~/core/state/editor/utils';
import { NavUtils } from '~/core/utils/utils';

import { Spacer } from '~/design-system/spacer';

import { NoContent } from '../space-tabs/no-content';
import { createCommandExtension } from './command-extension';
import { createEntityMentionExtension } from './entity-mention-extension';
import { tiptapExtensions } from './extensions';
import { createGraphLinkHoverExtension } from './graph-link-hover-extension';
import { createIdExtension } from './id-extension';
import { ServerContent } from './server-content';
import { editorContentVersionAtom } from '~/atoms';

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
  const router = useRouter();
  const { upsertEditorState, editorJson, serverBlocks, activeEntityId, blockIds, setHasContent } = useEditorStore();
  const editable = useUserIsEditing(spaceId);
  const editorContentVersion = useAtomValue(editorContentVersionAtom);

  // Also keep editableRef for callbacks and extensions
  const editableRef = React.useRef(editable);

  // Keep editableRef.current updated for callbacks
  React.useLayoutEffect(() => {
    editableRef.current = editable;
  }, [editable]);

  // Use editable state for editor - this will be passed to extensions via editor.isEditable

  // Use useMemo with stable deps to prevent extension recreation on sync engine updates
  // This is critical for suggestion plugins (like entity mention) to maintain state
  const extensions = React.useMemo(
    () => [
      ...tiptapExtensions,
      createIdExtension(spaceId),
      createGraphLinkHoverExtension(spaceId, router),
      createEntityMentionExtension(spaceId),
      createCommandExtension(spaceId),
    ],
    // Only recreate when spaceId changes - router is stable
    [spaceId, router]
  );

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

  // Ref to hold the current editor instance for use in effects
  const editorRef = React.useRef<TiptapEditor | null>(null);

  // Track the previous editable state to detect transitions from edit → read mode
  const prevEditableRef = React.useRef(editable);

  const editor = useEditor(
    {
      extensions,
      editable: editable,
      content: editorJson,
      editorProps: {
        transformPastedHTML: (html: string) => {
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
            (editor
              .getJSON()
              .content?.some(node => node.type === 'image' || node.type === 'tableNode' || node.type === 'codeBlock') ??
              false);

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

  const editorWrapperRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!editor) return;

    const currentDoc = normalizeEditorContent(editor.getJSON());
    const nextDoc = normalizeEditorContent(editorJson);

    if (JSON.stringify(currentDoc) === JSON.stringify(nextDoc)) {
      return;
    }

    // Keep the editor instance alive for data blocks, but sync external store
    // changes like entity/block deletion into the active ProseMirror document.
    editor.commands.setContent(editorJson);
  }, [editor, editorJson]);

  const handleGutterClick = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!editor || !editable) return;

      // Only focus when clicking on the editor wrapper itself, not inner content.
      if (e.target === e.currentTarget) {
        editor.commands.focus();
      }
    },
    [editor, editable]
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
      <div
        ref={editorWrapperRef}
        className={editable ? 'editable' : 'not-editable'}
        onClick={handleGutterClick}
        style={editable ? { minHeight: '8rem' } : undefined}
      >
        {editor ? <EditorContent editor={editor} /> : <ServerContent blocks={serverBlocks} />}

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
      const target = event.target as Element | null;
      if (!target) {
        return;
      }

      const link = target.closest('a');

      if (!link) {
        return;
      }

      // Check if the clicked element is a link
      if (link.tagName === 'A') {
        const originalUrl = link.href;

        if (originalUrl.startsWith('graph://')) {
          // Check if we're in edit mode - if so, don't redirect, allow text editing
          const isInEditMode = link.closest('.editable') !== null;

          if (isInEditMode) {
            // In edit mode, don't prevent default - allow normal text selection/editing
            return;
          }

          // Prevent the default link behavior
          event.stopPropagation();
          event.preventDefault();
          const entityId = GraphUrl.toEntityId(originalUrl as `graph://${string}`);
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

// ProseMirror calls flushSync during EditorContent mount — harmless but noisy in dev.
// https://github.com/ueberdosis/tiptap/issues/3764
const useSuppressFlushSyncWarning = () => {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const orig = console.error;
    console.error = (...args: unknown[]) => {
      // Only suppress the specific TipTap flushSync warning
      if (
        typeof args[0] === 'string' &&
        args[0].includes('flushSync was called from inside a lifecycle method')
      ) {
        return;
      }
      orig.apply(console, args);
    };
    return () => {
      console.error = orig;
    };
  }, []);
};

function normalizeEditorContent(content: JSONContent): JSONContent {
  const normalizedAttrs = content.attrs
    ? Object.fromEntries(
        Object.entries(content.attrs).filter(([key, value]) => {
          if (value === null || value === undefined) return false;
          return key !== 'spaceId' && key !== 'relationId';
        })
      )
    : undefined;

  return {
    ...content,
    ...(normalizedAttrs && Object.keys(normalizedAttrs).length > 0 ? { attrs: normalizedAttrs } : {}),
    ...(!normalizedAttrs || Object.keys(normalizedAttrs).length === 0 ? { attrs: undefined } : {}),
    ...(content.content
      ? {
          content: content.content.map(child => normalizeEditorContent(child)),
        }
      : {}),
  };
}
