import { AppProps } from 'next/app'
import { Navbar } from '~/modules/ui/navbar'
import { WalletProvider } from '~/modules/identity'
import '~/styles/tailwind.css'
import { useIsMounted } from '~/modules/ui/hooks/use-is-mounted'
import {
  publishService,
  PublishServiceProvider,
} from '~/modules/api/publish-service'

function MyApp({ Component, pageProps }: AppProps) {
  const isMounted = useIsMounted()

  return (
    <PublishServiceProvider value={publishService}>
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
    </PublishServiceProvider>
  )
}

export default MyApp
