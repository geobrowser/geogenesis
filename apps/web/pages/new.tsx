import { motion } from 'framer-motion'
import { useAccount } from 'wagmi'
import { usePublishService } from '~/modules/api/publish-service'
import { Editor } from '~/modules/editor/editor'

export default function New() {
  // TODO: Abstract guarded routes
  const { isConnected } = useAccount()
  const publishService = usePublishService()

  if (!isConnected) {
    return (
      <div className="layout">
        <h1 className="text-lg font-medium">
          Sign in to your wallet to start publishing content in Geo
        </h1>
      </div>
    )
  }

  return (
    <motion.div className="layout" layout="position">
      <Editor publishService={publishService} />
    </motion.div>
  )
}
