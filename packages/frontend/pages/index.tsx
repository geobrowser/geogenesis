import { AnimatePresence } from 'framer-motion'
import { useAccount } from 'wagmi'
import { Animate } from '~/modules/ui/animate'
import { Editor } from '~/modules/ui/editor'

const Home = () => {
  const { isConnected } = useAccount()

  return (
    <AnimatePresence exitBeforeEnter>
      {!isConnected ? (
        <Animate key="Sign in" className="space-y-4" animation="fade">
          <h1 className="text-lg font-medium">
            Sign in to your wallet to start publishing content in Geo
          </h1>
        </Animate>
      ) : (
        <Animate key="Sign out" animation="fade">
          <Editor />
        </Animate>
      )}
    </AnimatePresence>
  )
}

export default Home
