import { EditorContent, EditorOptions, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { memo, useState } from 'react'
import showdown from 'showdown'
import { Content } from './content'

interface Props {
  contentService: Content
  initialContent?: string
  editable?: EditorOptions['editable']
}

const converter = new showdown.Converter()

const DEFAULT_CONTENT = 'In the hole in a ground there lived a hobbit.'

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
    extensions: [StarterKit],
    content,
    editable,
    editorProps: {
      attributes: {
        placeholder: 'In a hole in the ground there lived a hobbit...',
        class:
          'prose prose-sm sm:prose prose-stone lg:prose-md xl:prose-lg mx-auto min-h-full focus:outline-none font-mono focus:ring rounded px-4 py-2',
      },
    },
    onUpdate: ({ editor }) =>
      contentService.setContent(converter.makeMarkdown(editor.getHTML())),
  })

  return <EditorContent editor={editor} />
})
