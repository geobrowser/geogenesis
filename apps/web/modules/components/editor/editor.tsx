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

interface Props {
  editable?: boolean;
}

export const tiptapExtensions = [
  StarterKit,
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
];

export const Editor = React.memo(function Editor({ editable = true }: Props) {
  const entityStore = useEntityStore();

  const editor = useEditor(
    {
      extensions: tiptapExtensions,
      editable: editable,
      content: entityStore.editorJson,
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
    [editable]
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
