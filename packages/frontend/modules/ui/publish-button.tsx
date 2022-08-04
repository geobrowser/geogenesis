import { motion } from 'framer-motion'
import { useNetwork, useSigner } from 'wagmi'
import { usePublishService } from '~/modules/api/publish-service'
import { useRouter } from 'next/router'
import { observer } from 'mobx-react-lite'
import { PuffLoader } from 'react-spinners'

export const PublishButton = observer(() => {
  const router = useRouter()
  const { chain } = useNetwork()
  const { data: signer } = useSigner()
  const publishService = usePublishService()

  const onPublish = async () => {
    // @ts-expect-error type mismatch for signer
    const tokenId = await publishService.publish(signer, chain)
    router.replace(`/token/${tokenId}`)
  }

  return (
    <motion.button
      layout
      whileTap={{ scale: 0.95 }}
      whileHover={{ scale: 1.05 }}
      className="rounded-xl px-4 py-2 bg-blue-700 text-slate-100 font-bold shadow-lg"
      onClick={onPublish}
    >
      {publishService.publishState === 'idle' && 'Publish'}
      {publishService.publishState !== 'idle' && (
        <PuffLoader size={24} color="#ffffff" />
      )}
    </motion.button>
  )
})
