import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

export function Editor() {
    const editor = useEditor({
        extensions: [StarterKit],
        content: '<p>Hello world!</p>',
        editorProps: {
            attributes: {
                placeholder: 'In a hole in the ground there lived a hobbit...',
                class: 'prose prose-sm sm:prose prose-stone lg:prose-md xl:prose-lg mx-auto min-h-full focus:outline-none font-mono focus:ring rounded px-4 py-2',
            },
        },
        onUpdate: ({ editor }) => {
            const html = editor.getHTML();
        },
    });

    return <EditorContent className='' editor={editor} />;
}
