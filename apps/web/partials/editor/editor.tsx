'use client';

import { GraphUrl } from '@geoprotocol/geo-sdk';
import type { EditorView } from '@tiptap/pm/view';
import { EditorContent, Editor as TiptapEditor, useEditor, JSONContent } from '@tiptap/react';
import { LayoutGroup } from 'framer-motion';
import { useRouter } from 'next/navigation';

import * as React from 'react';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useEditorStore } from '~/core/state/editor/use-editor';
import { removeIdAttributes } from '~/core/state/editor/utils';
import { NavUtils } from '~/core/utils/utils';

import { Spacer } from '~/design-system/spacer';

import { NoContent } from '../space-tabs/no-content';
import { tiptapExtensions } from './extensions';
import { createGraphLinkHoverExtension } from './graph-link-hover-extension';
import { createIdExtension } from './id-extension';
import { ServerContent } from './server-content';
import { createEntityMentionExtension } from './entity-mention-extension';
import { createCommandExtension } from './command-extension';
import { FloatingToolbarExtension } from './floating-toolbar-extension';

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
  const { upsertEditorState, editorJson, blockIds, setHasContent } = useEditorStore();
  const editable = useUserIsEditing(spaceId);
  const [isTransitioning, setIsTransitioning] = React.useState(false);

  // Track when editable state is changing to prevent flushSync errors
  React.useEffect(() => {
    setIsTransitioning(true);
    const timer = setTimeout(() => setIsTransitioning(false), 100);
    return () => clearTimeout(timer);
  }, [editable]);

  // Debounced save handler 
  const saveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Track upsertEditorState with a ref to avoid stale closures
  const upsertEditorStateRef = React.useRef(upsertEditorState);

  React.useLayoutEffect(() => {
    upsertEditorStateRef.current = upsertEditorState;
  }, [upsertEditorState]);

  const debouncedSave = React.useCallback((json: JSONContent) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      // We check the ref here to ensure we don't save if unmounted or if logic changes
      upsertEditorStateRef.current(json);
    }, 1000);
  }, []);

  // Clean up timeout on unmount
  React.useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Track editable state with a ref to avoid stale closures in callbacks
  const editableRef = React.useRef(editable);

  React.useLayoutEffect(() => {
    editableRef.current = editable;
  }, [editable]);

  const extensions = React.useMemo(
    () => [
      ...tiptapExtensions,
      createIdExtension(spaceId),
      createGraphLinkHoverExtension(spaceId, router),
      createEntityMentionExtension(spaceId),
      createCommandExtension(spaceId),
      FloatingToolbarExtension,
    ],
    [spaceId, router]
  );

  useInterceptEditorLinks(spaceId);

  const onBlur = React.useCallback(
    (params: { editor: TiptapEditor }) => {
      if (editableRef.current) {
        // Responsible for converting all editor blocks to Geo knowledge graph state
        upsertEditorStateRef.current(params.editor.getJSON());
      }
    },
    []
  );

  const editorProps = React.useMemo(
    () => ({
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
        paste: (view: EditorView, event: ClipboardEvent) => {
          // Get pasted content
          const clipboardData = event.clipboardData;
          if (clipboardData) {
            const htmlData = clipboardData.getData('text/html');
            const textData = clipboardData.getData('text/plain');
            // If there's HTML data that might contain emoji images, prevent default and handle manually
            if (htmlData && (htmlData.includes('emoji') || htmlData.includes('twimg.com'))) {
              event.preventDefault();

              // Insert as plain text to avoid emoji image conversion
              if (textData) {
                view.dispatch(view.state.tr.insertText(textData));
              }
              return true;
            }
            // For plain text or HTML without emoji images, let TipTap handle normally
            // This allows lists and other formatted content to be processed correctly
            return false;
          }
          return false;
        },
      },
    }),
    []
  );

  const editor = useEditor(
    {
      extensions,
      editable: true, // Keep editor always editable to prevent recreation
      content: editorJson,
      editorProps,
      immediatelyRender: false,
      onBlur: onBlur,
      onUpdate: ({ editor }) => {
        if (editableRef.current) {
          const hasContent =
            editor.getText().trim().length > 0 ||
            (editor.getJSON().content?.some(node => node.type === 'image' || node.type === 'tableNode') ?? false);

          // Update the state immediately to show/hide properties panel
          setHasContent(hasContent);

          // Trigger debounced save
          debouncedSave(editor.getJSON());
        }
      },
    },
    [extensions, editorProps, onBlur]
  );

  // Update editor editable state without recreating the editor
  React.useEffect(() => {
    if (editor && !isTransitioning) {
      editor.setEditable(editable);

      // Force save when switching to view mode to ensure latest state is persisted
      if (!editable) {
        upsertEditorState(editor.getJSON());
      }
    }
  }, [editor, editable, isTransitioning, upsertEditorState]);

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
          // Check if we're in edit mode - if so, don't redirect, allow text editing
          const isInEditMode = link.closest('.editable') !== null;

          if (isInEditMode) {
            // In edit mode, don't prevent default - allow normal text selection/editing
            return;
          }

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
