import { motion } from 'framer-motion'
import { useNetwork, useSigner } from 'wagmi'
import { usePublishService } from '~/modules/api/publish-service'
import { useRouter } from 'next/router'
import { observer } from 'mobx-react-lite'

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
      whileTap={{ scale: 0.9 }}
      className="rounded-xl px-4 bg-blue-700 text-slate-100 font-bold shadow-lg"
      onClick={onPublish}
    >
      {publishService.publishState === 'idle' && 'Publish'}
      {publishService.publishState === 'uploading' && 'Uploading...'}
      {publishService.publishState === 'minting' && 'Minting...'}
    </motion.button>
  )
})
