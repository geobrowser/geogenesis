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
import { ContentService } from './content'
import { MenuItem } from './menu-item'
import { Italic } from '../ui/icons/italic'
import { Bold } from '../ui/icons/bold'
import { Quote } from '../ui/icons/quote'
import { Link } from '../ui/icons/link'
import { List } from '../ui/icons/list'
import { NumberedList } from '../ui/icons/numbered-list'

interface Props {
  contentService: ContentService
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
          editor={editor}
          tippyOptions={{ hideOnClick: false, maxWidth: '100%' }}
        >
          <div className="bg-slate-50 shadow-lg p-4 space-x-3 rounded-xl flex justify-between items-center w-full">
            <MenuItem
              onClick={editor.chain().focus().toggleBold().run}
              isActive={editor.isActive('bold')}
            >
              <Bold isActive={editor.isActive('bold')} />
            </MenuItem>
            <MenuItem
              onClick={editor.chain().focus().toggleItalic().run}
              isActive={editor.isActive('italic')}
            >
              <Italic isActive={editor.isActive('italic')} />
            </MenuItem>
            <MenuItem
              onClick={editor.chain().focus().toggleBlockquote().run}
              isActive={editor.isActive('blockquote')}
            >
              <Quote isActive={editor.isActive('blockquote')} />
            </MenuItem>
            <MenuItem
              onClick={editor.chain().focus().toggleLink({ href: '' }).run}
              isActive={editor.isActive('link')}
            >
              <Link isActive={editor.isActive('link')} />
            </MenuItem>
            <hr className=" bg-stone-300 w-0.5 h-5" />
            <MenuItem
              onClick={editor.chain().focus().toggleBulletList().run}
              isActive={editor.isActive('bulletList')}
            >
              <List isActive={editor.isActive('bulletList')} />
            </MenuItem>
            <MenuItem
              onClick={editor.chain().focus().toggleOrderedList().run}
              isActive={editor.isActive('orderedList')}
            >
              <NumberedList isActive={editor.isActive('orderedList')} />
            </MenuItem>
          </div>
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />
    </>
  )
})
