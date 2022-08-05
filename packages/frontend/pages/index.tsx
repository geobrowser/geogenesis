import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { useAccount } from 'wagmi'

const Home = () => {
  const { isConnected } = useAccount()
  const router = useRouter()

  // TODO: Abstract guarded routes
  useEffect(() => {
    if (isConnected) router.push('/new')
  }, [isConnected, router])

  return (
    <h1 className="text-lg font-medium">
      Sign in to your wallet to start publishing content in Geo
    </h1>
  )
}

export default Home
