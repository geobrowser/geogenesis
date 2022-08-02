import { ConnectButton } from '@rainbow-me/rainbowkit';
import type { NextPage } from 'next';

const Home: NextPage = () => {
    return (
        <div className='space-y-4'>
            <h1 className='text-lg font-medium'>Sign in to your wallet to start publishing content in Geo</h1>
            <ConnectButton label='Sign in' />
        </div>
    );
};

export default Home;
