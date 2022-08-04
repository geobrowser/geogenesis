import { ConnectButton } from '@rainbow-me/rainbowkit'
import { AnimatePresence, motion } from 'framer-motion'
import { useAccount } from 'wagmi'
import { Animate } from './animate'
import { PublishButton } from './publish-button'

export function PublishNavbar() {
  const { isConnected } = useAccount()

  return (
    <nav className="navbar">
      <h1 className="text-2xl font-bold tracking-tighter">GEO</h1>
      <AnimatePresence exitBeforeEnter>
        <Animate
          key={`publish-navbar-actions-${isConnected}`}
          animation="fade"
          className="flex items-center"
        >
          {isConnected && (
            <Animate
              animation="fade"
              className="flex items-center justify-between"
            >
              <PublishButton />
              <hr className="w-8 border-none" />
            </Animate>
          )}
          <ConnectButton
            label="Sign in"
            chainStatus="none"
            showBalance={false}
          />
        </Animate>
      </AnimatePresence>
    </nav>
  )
}

export function ViewNavbar() {
  const { isConnected } = useAccount()

  return (
    <nav className="navbar">
      <h1 className="text-2xl font-bold tracking-tighter">GEO</h1>
      <AnimatePresence exitBeforeEnter>
        <Animate
          key={`view-navbar-actions-${isConnected}`}
          animation="fade"
          className="flex items-center"
        >
          <ConnectButton
            label="Sign in"
            chainStatus="none"
            showBalance={false}
          />
        </Animate>
      </AnimatePresence>
    </nav>
  )
}
