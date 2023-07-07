import * as React from 'react';
import { EditorContent, FloatingMenu, useEditor } from '@tiptap/react';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import Gapcursor from '@tiptap/extension-gapcursor';

import { SquareButton } from '~/modules/design-system/button';
import { Spacer } from '~/modules/design-system/spacer';
import { useEntityStore } from '~/modules/entity';
import { ConfiguredCommandExtension } from './command-extension';
import { removeIdAttributes } from './editor-utils';
import { IdExtension } from './id-extension';
import { TableNode } from './table-node';
import { ParagraphNode } from './paragraph-node';

interface Props {
  editable?: boolean;
}

export const tiptapExtensions = [
  StarterKit.configure({
    paragraph: false,
  }),
  ConfiguredCommandExtension,
  Gapcursor,
  TableNode,
  Image,
  Placeholder.configure({
    placeholder: ({ node }) => {
      const isHeading = node.type.name === 'heading';
      return isHeading ? 'Heading...' : '/ to select content block or write some content...';
    },
  }),
  IdExtension,
  ParagraphNode,
];

export const Editor = React.memo(function Editor({ editable = true }: Props) {
  const entityStore = useEntityStore();

  // @HACK: Janky but works for now. Will probably be super slow for large pages.
  // We need to keep the editor in sync with the local data store. Without this level
  // of memoization the editor will re-render on every blur and edit toggle which causes
  // all of the custom react components within the editor to re-mount. This is janky UX,
  // especially for the table node which has a lot of state and data fetching.
  //
  // An alternative to this approach is to wait to render the editor until we know
  // that we have all the local data merged in already. In that approach we would
  // only ever need to render the editor the first time.
  //
  // A third approach is to cache all requests in table nodes and just allow the
  // editor to re-mount the internal react components. Not sure how viable this is
  // as I haven't tested it.
  const stringifiedJson = JSON.stringify(entityStore.editorJson);
  const memoizedJson = React.useMemo(() => entityStore.editorJson, [stringifiedJson]); // eslint-disable-line react-hooks/exhaustive-deps

  const editor = useEditor(
    {
      extensions: tiptapExtensions,
      editable: true,
      content: memoizedJson,
      onBlur({ editor }) {
        /*
        Responsible for converting all editor blocks to triples
        Fires after the IdExtension's onBlur event which sets the "id" attribute on all nodes
        */
        entityStore.updateEditorBlocks(editor);
      },
      editorProps: {
        transformPastedHTML: html => removeIdAttributes(html),
      },
    },
    [memoizedJson]
  );

  if (!editable && entityStore.blockIds.length === 0) return null;

  if (!editor) return null;

  const openCommandMenu = () => editor?.chain().focus().insertContent('/').run();

  return (
    <div>
      <EditorContent editor={editor} />
      <FloatingMenu editor={editor}>
        <div className="absolute -left-12 -top-3">
          <SquareButton onClick={openCommandMenu} icon="plus" />
        </div>
      </FloatingMenu>
      {/*
        Right now this component adds its own space below it. It's only used on the
        entity page so this styling is universal. Eventually we want the callsite
        to provide layout styling and not the component itself.
       */}
      <Spacer height={60} />
    </div>
  );
});
