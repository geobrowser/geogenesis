import { AnimatePresence } from 'framer-motion';
import { useAccount } from 'wagmi';
import { Animate } from '~/modules/ui/animate';
import { Editor } from '~/modules/editor/editor';
// This can come through context or something dependency injected as well
import { contentService } from '~/modules/editor/content';

const Home = () => {
    const { isConnected } = useAccount();

    return (
        <AnimatePresence exitBeforeEnter>
            {!isConnected ? (
                <Animate key='Sign in' className='space-y-4' animation='fade'>
                    <h1 className='text-lg font-medium'>Sign in to your wallet to start publishing content in Geo</h1>
                </Animate>
            ) : (
                <Animate key='Signed in' animation='fade'>
                    <Editor contentService={contentService} />
                </Animate>
            )}
        </AnimatePresence>
    );
};

export default Home;
