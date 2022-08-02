import { AnimatePresence } from 'framer-motion';
import type { NextPage } from 'next';
import { useAccount } from 'wagmi';
import { Animate } from '~/modules/ui/animate';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

const Home: NextPage = () => {
    const { isConnected } = useAccount();
    const editor = useEditor({
        extensions: [StarterKit],
        content: '<p>In a whole in the ground there lived a hobbit...</p>',
    });

    return (
        <AnimatePresence exitBeforeEnter>
            {!isConnected ? (
                <Animate key='Sign in' className='space-y-4' animation='fade'>
                    <h1 className='text-lg font-medium'>Sign in to your wallet to start publishing content in Geo</h1>
                </Animate>
            ) : (
                <Animate key='Signed in' animation='fade'>
                    <EditorContent editor={editor} />
                </Animate>
            )}
        </AnimatePresence>
    );
};

export default Home;
