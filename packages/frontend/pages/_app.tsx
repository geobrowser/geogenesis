import { AppProps } from 'next/app';
import { WalletProvider } from '../modules/identity';
import '../styles/tailwind.css';
import '@rainbow-me/rainbowkit/styles.css';

function MyApp({ Component, pageProps }: AppProps) {
    return (
        <WalletProvider>
            <Component {...pageProps} />
        </WalletProvider>
    );
}

export default MyApp;
