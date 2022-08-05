import { motion } from 'framer-motion'
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
import { Animate } from '~/modules/ui/animate'

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter()
  const isMounted = useIsMounted()
  const isNewRoute = router.pathname === '/new'
  const backgroundColor = isNewRoute ? '#f6f6f6' : '#ffffff'

  return (
    <PublishServiceProvider value={publishService}>
      <WalletProvider>
        {isMounted && (
          // Animates the page background. Right now if we are on the /new route we animate to
          // a slightly grey background, and for every other route we animate to a pure white background.
          <motion.div
            initial={{ backgroundColor: '#ffffff' }}
            animate={{ backgroundColor }}
            className="background-color-wrapper min-h-screen"
          >
            <Navbar />

            {/* 
                Animates content of /pages when it mounts/unmounts. Right now we have a root
                animation for fading the content of /pages, but we can also write custom animations
                based in the route itself if we prefer doing that.
            */}
            {/* <AnimatePresence exitBeforeEnter>
              <Animate
                key={`page-${router.pathname}`}
                animation="fade"
                className="layout"
              > */}
            <main key={`page-${router.pathname}`} className="layout">
              <Component {...pageProps} />
            </main>
            {/* </Animate>
            </AnimatePresence> */}
          </motion.div>
        )}
      </WalletProvider>
    </PublishServiceProvider>
  )
}

export default MyApp
