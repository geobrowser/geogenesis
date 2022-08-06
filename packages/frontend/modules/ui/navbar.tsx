import { ConnectButton } from '@rainbow-me/rainbowkit'
import { AnimatePresence, motion } from 'framer-motion'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAccount } from 'wagmi'
import { Animate } from './animate'
import { Heart } from './icons/heart'
import { PublishButton } from './publish-button'

interface Props {
  backgroundColor: string
}

export function Navbar({ backgroundColor }: Props) {
  const { isConnected } = useAccount()
  const router = useRouter()
  const isNewRoute = router.pathname === '/new'

  // TODO: Pass "action element group" to Navbar so different route context can inject
  // the elements they want to render in the navbar.
  return (
    <motion.nav animate={{ backgroundColor }} className="navbar">
      <div className="flex space-x-3 items-center">
        <h1 className="text-2xl font-bold tracking-tighter">GEO</h1>
        <Link href="/new">New</Link>
        <Link href="/token/68">Viewer</Link>
      </div>
      <AnimatePresence exitBeforeEnter>
        <div className="flex justify-center items-center">
          <AnimatePresence exitBeforeEnter>
            {isConnected && (
              <>
                {isNewRoute && (
                  <Animate animation="fade" className="flex" delay={0.5}>
                    <PublishButton key="publish-button" />
                    <hr className="w-8 border-none" />
                  </Animate>
                )}
                {!isNewRoute && (
                  <>
                    <div className="flex items-center space-x-6">
                      <Animate animation="fade" className="flex" delay={0.65}>
                        <button
                          key="save-button"
                          className="flex items-center space-x-2 font-bold"
                          onClick={() => alert('save!')}
                        >
                          <Heart />
                          <p>Save</p>
                        </button>
                      </Animate>
                      <Animate animation="fade" className="flex" delay={0.5}>
                        <button
                          key="edit-button"
                          className="flex items-center space-x-2 font-bold rounded-3xl bg-geo-grey-4 px-4 py-2"
                          onClick={() => alert('edit!')}
                        >
                          Edit
                        </button>
                      </Animate>
                    </div>
                    <hr className="w-8 border-none" />
                  </>
                )}
              </>
            )}
          </AnimatePresence>
          <ConnectButton
            label="Sign in"
            chainStatus="none"
            showBalance={false}
          />
        </div>
      </AnimatePresence>
    </motion.nav>
  )
}
