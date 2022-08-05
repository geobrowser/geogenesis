import { motion } from 'framer-motion'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { useAccount } from 'wagmi'
import { usePublishService } from '~/modules/api/publish-service'
import { Editor } from '~/modules/editor/editor'

export default function New() {
  // TODO: Abstract guarded routes
  const { isConnected } = useAccount()
  const router = useRouter()
  const publishService = usePublishService()

  useEffect(() => {
    if (!isConnected) router.push('/')
  }, [isConnected, router])

  return (
    <motion.div layout="position">
      <Editor publishService={publishService} />
    </motion.div>
  )
}
