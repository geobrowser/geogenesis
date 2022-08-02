import { ConnectButton } from '@rainbow-me/rainbowkit';
import { AnimatePresence } from 'framer-motion';
import { useAccount } from 'wagmi';
import { Animate } from './animate';
import { PublishButton } from './publish';

export function Navbar() {
    const { isConnected } = useAccount();

    return (
        <nav className='navbar flex justify-between'>
            <h1 className='text-2xl font-bold tracking-tighter'>GEO</h1>
            <AnimatePresence exitBeforeEnter>
                <Animate key={`navbar-actions-${isConnected}`} animation='fade' className='flex space-x-8'>
                    {isConnected && <PublishButton />}
                    <ConnectButton label='Sign in' />
                </Animate>
            </AnimatePresence>
        </nav>
    );
}
