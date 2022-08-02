import { AppProps } from 'next/app';
import { Navbar } from '~/modules/ui/navbar';
import { WalletProvider } from '~/modules/identity';
import '~/styles/tailwind.css';

function MyApp({ Component, pageProps }: AppProps) {
    return (
        <WalletProvider>
            <Navbar />
            <div className='layout'>
                <Component {...pageProps} />
            </div>
        </WalletProvider>
    );
}

export default MyApp;
