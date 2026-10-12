'use client';

import * as React from 'react';

import dynamic from 'next/dynamic';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useEditorServerContent } from '~/core/state/editor/use-editor-blocks';

import { ServerContent } from './server-content';

type EditorProps = {
  spaceId: string;
  placeholder?: React.ReactNode;
  shouldHandleOwnSpacing?: boolean;
};

// Mirrors what Editor renders before its TipTap instance exists, so the server HTML and the
// pre-hydration paint are the same as when Editor was imported statically.
function EditorFallback({ spaceId, placeholder = null }: EditorProps) {
  const { serverBlocks, blockIds } = useEditorServerContent();
  const editable = useUserIsEditing(spaceId);

  if (!editable && blockIds.length === 0) return <>{placeholder}</>;

  return (
    <div
      className={editable ? 'editable relative' : 'not-editable'}
      style={editable ? { minHeight: '8rem' } : undefined}
    >
      <ServerContent blocks={serverBlocks} />
    </div>
  );
}

const EditorPropsContext = React.createContext<EditorProps | null>(null);

function LoadingEditor() {
  const props = React.useContext(EditorPropsContext);
  return props ? <EditorFallback {...props} /> : null;
}

// The TipTap editor (~2MB) lives in its own chunk instead of the route's first-load JS.
// next/dynamic's loading component receives no props, so they travel by context.
const DynamicEditor = dynamic<EditorProps>(() => import('./editor').then(m => m.Editor), {
  ssr: false,
  loading: LoadingEditor,
});

export function Editor(props: EditorProps) {
  return (
    <EditorPropsContext.Provider value={props}>
      <DynamicEditor {...props} />
    </EditorPropsContext.Provider>
  );
}
