import { AnimatePresence } from 'framer-motion';
import type { NextPage } from 'next';
import { useAccount } from 'wagmi';
import { Animate } from '~/modules/ui/animate';
import { Editor } from '~/modules/editor/editor';

const Home: NextPage = () => {
    const { isConnected } = useAccount();

    return (
        <AnimatePresence exitBeforeEnter>
            {!isConnected ? (
                <Animate key='Sign in' className='space-y-4' animation='fade'>
                    <h1 className='text-lg font-medium'>Sign in to your wallet to start publishing content in Geo</h1>
                </Animate>
            ) : (
                <Animate key='Signed in' animation='fade'>
                    <Editor />
                </Animate>
            )}
        </AnimatePresence>
    );
};

export default Home;
