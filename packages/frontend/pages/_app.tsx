import { AnimatePresence, motion } from 'framer-motion'
import { AppProps } from 'next/app'
import { useRouter } from 'next/router'
import { Navbar } from '~/modules/ui/navbar'
import { WalletProvider } from '~/modules/identity'
import '~/styles/tailwind.css'
import { useIsMounted } from '~/modules/ui/hooks/use-is-mounted'
import {
  publishService,
  PublishServiceProvider,
} from '~/modules/api/publish-service'

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter()
  const isMounted = useIsMounted()
  const isNewRoute = router.pathname === '/new'
  const backgroundColor = isNewRoute ? '#f5f5f5' : '#ffffff'

  return (
    <PublishServiceProvider value={publishService}>
      <WalletProvider>
        {isMounted && (
          // Animates the page background. Right now if we are on the /new route we animate to
          // a slightly grey background, and for every other route we animate to a pure white background.
          <motion.div
            initial={{ backgroundColor: '#ffffff' }}
            animate={{ backgroundColor }}
            transition={{ duration: 0.5 }}
            className="background-color-wrapper min-h-screen"
          >
            <Navbar backgroundColor={backgroundColor} />

            <AnimatePresence exitBeforeEnter>
              <main key={`page-${router.pathname}`} className="layout">
                <Component {...pageProps} />
              </main>
            </AnimatePresence>
          </motion.div>
        )}
      </WalletProvider>
    </PublishServiceProvider>
  )
}

export default MyApp
