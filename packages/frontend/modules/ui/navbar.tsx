import { ConnectButton } from '@rainbow-me/rainbowkit'
import { AnimatePresence } from 'framer-motion'
import { useAccount } from 'wagmi'
// import { ConnectButton } from '../identity'
import { Animate } from './animate'
import { PublishButton } from './publish-button'

export function Navbar() {
  const { isConnected } = useAccount()

  return (
    <nav className="navbar">
      <h1 className="text-2xl font-bold tracking-tighter">GEO</h1>
      <AnimatePresence exitBeforeEnter>
        <Animate
          key={`navbar-actions-${isConnected}`}
          animation="fade"
          className="flex space-x-8"
        >
          {isConnected && <PublishButton />}
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
