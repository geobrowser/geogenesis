import {
  BubbleMenu,
  EditorContent,
  EditorOptions,
  useEditor,
} from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import LinkExtension from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Document from '@tiptap/extension-document'
import { memo, useState } from 'react'
import showdown from 'showdown'
import { PublishService } from '../api/publish-service'
import { MenuItem } from './menu-item'
import { Italic } from '../ui/icons/italic'
import { Bold } from '../ui/icons/bold'
import { Quote } from '../ui/icons/quote'
import { Link } from '../ui/icons/link'
import { List } from '../ui/icons/list'
import { NumberedList } from '../ui/icons/numbered-list'
import { LargeHeading } from '../ui/icons/large-heading'
import { SmallHeading } from '../ui/icons/small-heading'

interface Props {
  publishService: PublishService
  initialContent?: string
  editable?: EditorOptions['editable']
}

const converter = new showdown.Converter()

const PLACEHOLDER = 'Start by giving your page a title...'

const CustomDocument = Document.extend({
  content: 'heading block*',
})

// Don't want to rerender the editor over and over
export const Editor = memo(function Editor({
  publishService,
  initialContent,
  editable,
}: Props) {
  // Only convert markdown to html once on mount
  const [content] = useState(() => {
    return initialContent ? converter.makeHtml(initialContent) : undefined
  })

  const editor = useEditor({
    extensions: [
      LinkExtension,
      CustomDocument,
      StarterKit.configure({
        document: false,
      }),
      Placeholder.configure({
        // Placeholder won't work if the editor is initially disabled on load. If this
        // becomes an issue with the page viewer we can create a separate "Read Only" editor
        showOnlyWhenEditable: false,
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') {
            return PLACEHOLDER
          }

          return ''
        },
      }),
    ],
    content,
    editable,
    editorProps: {
      attributes: {
        class: 'editor',
      },
    },
    onUpdate: ({ editor }) =>
      publishService.setContent(converter.makeMarkdown(editor.getHTML())),
  })

  return (
    <>
      {editor && (
        <BubbleMenu
          editor={editor}
          tippyOptions={{ hideOnClick: false, maxWidth: '100%' }}
        >
          <div className="shadow-lg p-4 space-x-3 rounded-xl flex justify-between items-center w-full">
            <MenuItem
              onClick={editor.chain().focus().toggleHeading({ level: 1 }).run}
              isActive={editor.isActive('heading', { level: 1 })}
            >
              <LargeHeading
                isActive={editor.isActive('heading', { level: 1 })}
              />
            </MenuItem>
            <MenuItem
              onClick={editor.chain().focus().toggleHeading({ level: 3 }).run}
              isActive={editor.isActive('heading', { level: 3 })}
            >
              <SmallHeading
                isActive={editor.isActive('heading', { level: 3 })}
              />
            </MenuItem>

            <hr className=" bg-stone-300 w-px h-5" />

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

            <hr className=" bg-stone-300 w-px h-5" />

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
