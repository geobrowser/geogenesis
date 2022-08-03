import { AppProps } from 'next/app'
import { Navbar } from '~/modules/ui/navbar'
import { WalletProvider } from '~/modules/identity'
import '~/styles/tailwind.css'
import { useIsMounted } from '~/modules/ui/hooks/use-is-mounted'

function MyApp({ Component, pageProps }: AppProps) {
  const isMounted = useIsMounted()

  return (
    <WalletProvider>
      {isMounted && (
        <>
          <Navbar />
          <div className="layout">
            <Component {...pageProps} />
          </div>
        </>
      )}
    </WalletProvider>
  )
}

export default MyApp
