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
    extensions: [StarterKit],
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

  return <EditorContent editor={editor} />
})
