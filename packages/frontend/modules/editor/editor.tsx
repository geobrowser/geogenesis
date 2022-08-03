import Image from 'next/image'
import {
  BubbleMenu,
  EditorContent,
  EditorOptions,
  useEditor,
} from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import LinkExtension from '@tiptap/extension-link'
import { memo, useState } from 'react'
import showdown from 'showdown'
import { Content } from './content'
import { MenuItem } from './menu-item'

interface Props {
  contentService: Content
  initialContent?: string
  editable?: EditorOptions['editable']
}

const converter = new showdown.Converter()

const DEFAULT_CONTENT = '<h1>Give your page a title...</h1>'

// Don't want to rerender the editor over and over
export const Editor = memo(function Editor({
  contentService,
  initialContent,
  editable,
}: Props) {
  // Only convert markdown to html once on mount
  const [content] = useState(() =>
    converter.makeHtml(initialContent || DEFAULT_CONTENT)
  )

  const editor = useEditor({
    extensions: [StarterKit, LinkExtension],
    content,
    editable,
    editorProps: {
      attributes: {
        placeholder: 'In a hole in the ground there lived a hobbit...',
        class: 'editor',
      },
    },
    onUpdate: ({ editor }) =>
      contentService.setContent(converter.makeMarkdown(editor.getHTML())),
  })

  return (
    <>
      {editor && (
        <BubbleMenu
          className="bg-slate-50 shadow-lg p-4 space-x-4 rounded-xl"
          editor={editor}
          tippyOptions={{ duration: 100 }}
        >
          <MenuItem
            onClick={editor.chain().focus().toggleBold().run}
            isActive={editor.isActive('bold')}
          >
            Bold
          </MenuItem>
          <MenuItem
            onClick={editor.chain().focus().toggleBold().run}
            isActive={editor.isActive('italic')}
          >
            Italic
          </MenuItem>
          <MenuItem
            onClick={editor.chain().focus().toggleBold().run}
            isActive={editor.isActive('strike')}
          >
            Strikethrough
          </MenuItem>
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />
    </>
  )
})
