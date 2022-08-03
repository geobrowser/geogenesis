import { EditorContent, EditorOptions, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { memo } from 'react'
import { Content } from './content'

interface Props {
  contentService: Content
  initialContent?: string
  editable?: EditorOptions['editable']
}

const DEFAULT_CONTENT = '<p>In the hole in a ground there lived a hobbit.</p>'

// Don't want to rerender the editor over and over
export const Editor = memo(function Editor({
  contentService,
  initialContent,
  editable,
}: Props) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: initialContent || DEFAULT_CONTENT,
    editable,
    editorProps: {
      attributes: {
        placeholder: 'In a hole in the ground there lived a hobbit...',
        class:
          'prose prose-sm sm:prose prose-stone lg:prose-md xl:prose-lg mx-auto min-h-full focus:outline-none font-mono focus:ring rounded px-4 py-2',
      },
    },
    onUpdate: ({ editor }) => contentService.setContent(editor.getHTML()),
  })

  return <EditorContent editor={editor} />
})
