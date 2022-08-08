import '~/styles/tailwind.css'

import { AnimatePresence, motion } from 'framer-motion'
import { AppProps } from 'next/app'
import { useRouter } from 'next/router'
import { ActionBar } from '~/modules/ui/action-bar'
import { WalletProvider } from '~/modules/identity'
import { useIsMounted } from '~/modules/ui/hooks/use-is-mounted'
import {
  PublishService,
  PublishServiceProvider,
} from '~/modules/api/publish-service'
import { getStorageClient } from '~/modules/api/storage'
import { GeoDocument__factory } from '~/../contracts'
import { Navbar } from '~/modules/ui/navbar'

const publishService = new PublishService(
  getStorageClient(),
  GeoDocument__factory
)

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter()
  const isMounted = useIsMounted()
  const isNewRoute = router.pathname === '/new'
  const backgroundColor = isNewRoute ? '#ededed' : '#ffffff'

  return (
    <PublishServiceProvider value={publishService}>
      <WalletProvider>
        {isMounted && (
          // Animates the page background. Right now if we are on the /new route we animate to
          // a slightly grey background, and for every other route we animate to a pure white background.
          <motion.div
            initial={{ backgroundColor: '#ffffff' }}
            animate={{ backgroundColor }}
            className="background-color-wrapper min-h-screen relative"
          >
            <Navbar />
            <ActionBar backgroundColor={backgroundColor} />

            <AnimatePresence exitBeforeEnter>
              {/* 
                  HACK to force the page's children to animate out. We don't want
                  to fade the content but do want the children to do their exit
                  animations. If we don't have an actual animation on motion.main
                  then the page transition will be instant.
              */}
              <motion.main
                initial={{ opacity: 0.99 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0.99 }}
                transition={{ duration: 0.5 }}
                key={`page-${router.pathname}`}
                className="layout"
              >
                <Component {...pageProps} />
              </motion.main>
            </AnimatePresence>
          </motion.div>
        )}
      </WalletProvider>
    </PublishServiceProvider>
  )
}

export default MyApp
