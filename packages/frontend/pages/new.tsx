import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { useAccount } from 'wagmi'
import { Editor } from '~/modules/ui/editor'
import { motion } from 'framer-motion'

export default function New() {
  // TODO: Abstract guarded routes
  const { isConnected } = useAccount()
  const router = useRouter()

  useEffect(() => {
    if (!isConnected) router.push('/')
  }, [isConnected, router])

  return <Editor />
}
