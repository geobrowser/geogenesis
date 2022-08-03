import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { memo } from 'react'
import { Content } from './content'

interface Props {
  contentService: Content
}

// Don't want to rerender the editor over and over
export const Editor = memo(function Editor({ contentService }: Props) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: '<p>In the hole in a ground there lived a hobbit.</p>',
    editorProps: {
      attributes: {
        placeholder: 'In a hole in the ground there lived a hobbit...',
        class: 'editor',
      },
    },
    onUpdate: ({ editor }) => contentService.setContent(editor.getHTML()),
  })

  return <EditorContent editor={editor} />
})
