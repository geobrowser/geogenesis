import { AppProps } from 'next/app';
import { WalletProvider } from '../modules/identity';
import '../styles/tailwind.css';
import '@rainbow-me/rainbowkit/styles.css';

function MyApp({ Component, pageProps }: AppProps) {
    return (
        <WalletProvider>
            <div className='layout'>
                <Component {...pageProps} />
            </div>
        </WalletProvider>
    );
}

export default MyApp;
