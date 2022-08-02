import { ConnectButton, useConnectModal } from '@rainbow-me/rainbowkit';
import type { NextPage } from 'next';
import { useAccount } from 'wagmi';

const Home: NextPage = () => {
    const { isConnected } = useAccount();

    return !isConnected ? (
        <div className='space-y-4'>
            <h1 className='text-lg font-medium'>Sign in to your wallet to start publishing content in Geo</h1>
        </div>
    ) : (
        <p>Do something cool...</p>
    );
};

export default Home;
