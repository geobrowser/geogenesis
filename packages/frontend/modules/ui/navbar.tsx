import { ConnectButton } from '@rainbow-me/rainbowkit';

export function Navbar() {
    return (
        <nav className='navbar flex justify-between'>
            <h1 className='text-2xl font-bold tracking-tighter'>GEO</h1>
            <ConnectButton label='Sign in' />
        </nav>
    );
}
