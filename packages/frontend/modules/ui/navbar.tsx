import { ConnectButton } from '@rainbow-me/rainbowkit'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouter } from 'next/router'
import { useAccount } from 'wagmi'
import { Animate } from './animate'
import { Heart } from './icons/heart'
import { PublishButton } from './publish-button'

export function Navbar() {
  const { isConnected } = useAccount()
  const router = useRouter()
  const isNewRoute = router.pathname === '/new'

  console.log(router.pathname)

  return (
    <nav className="navbar">
      <h1 className="text-2xl font-bold tracking-tighter">GEO</h1>
      <AnimatePresence exitBeforeEnter>
        <div className="flex justify-center items-center">
          {isConnected && (
            <>
              {isNewRoute && (
                <>
                  <PublishButton />
                  <hr className="w-8 border-none" />
                </>
              )}
              {!isNewRoute && (
                <>
                  <div className="flex items-center space-x-6">
                    <motion.button
                      className="flex items-center space-x-2 font-bold"
                      onClick={() => alert('save!')}
                    >
                      <Heart />
                      <p>Save</p>
                    </motion.button>
                    <motion.button
                      className="flex items-center space-x-2 font-bold rounded-3xl bg-gray-100 px-4 py-2"
                      onClick={() => alert('edit!')}
                    >
                      Edit
                    </motion.button>
                  </div>
                  <hr className="w-8 border-none" />
                </>
              )}
            </>
          )}
          <ConnectButton
            label="Sign in"
            chainStatus="none"
            showBalance={false}
          />
        </div>
      </AnimatePresence>
    </nav>
  )
}
