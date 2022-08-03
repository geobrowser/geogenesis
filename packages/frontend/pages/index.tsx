import { AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { useAccount } from 'wagmi'
import { Animate } from '~/modules/ui/animate'

const Home = () => {
  const { isConnected } = useAccount()
  const router = useRouter()

  // TODO: Abstract guarded routes
  useEffect(() => {
    if (isConnected) router.push('/new')
  }, [isConnected, router])

  return (
    <Animate key="Sign in" className="space-y-4" animation="fade">
      <h1 className="text-lg font-medium">
        Sign in to your wallet to start publishing content in Geo
      </h1>
    </Animate>
  )
}

export default Home
